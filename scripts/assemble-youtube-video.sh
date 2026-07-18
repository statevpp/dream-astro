#!/bin/bash
# assemble-youtube-video.sh — сглобява дневния Lumaris YouTube/TikTok епизод
# от предварително генерирани сегментни .wav (говор, _lib/tts.js) и фонови
# клипове/снимки (Veo 3.1 / Nano Banana 2, _lib/content-gen.js) в един готов
# .mp4 файл.
#
# ЗАЩО СЕГМЕНТНО, А НЕ ЕДИН ГОЛЯМ AUDIO+VIDEO ФАЙЛ: gemini.js
# generateYoutubeScript() нарочно връща скрипта разделен на intro + 12 знака
# + outro (виж коментара там) — точно защото само така можем да знаем кога
# свършва говора за Овен и започва за Телец, и съответно да сменим фоновия
# клип/да изпишем името на знака в правилния момент. Всеки сегмент се
# сглобява ОТДЕЛНО (собствен звук + собствен фон, вече точно синхронизирани
# по продължителност), а накрая просто се слепват — вместо да строим отделни
# video/audio писти и да ги подравняваме ръчно (много по-чупливо).
#
# Очаквана структура на work directory (виж generate-youtube-daily.js за
# точното име на файловете, които трябва да ги произведе):
#   audio/00-intro.wav   audio/01-aries.wav ... audio/12-pisces.wav   audio/13-outro.wav
#   bg/00-intro.(mp4|png|jpg)   bg/01-aries.(mp4|png|jpg) ...   bg/13-outro.(mp4|png|jpg)
# (00=intro, 01-12=12-те знака по реда от YOUTUBE_SIGN_ORDER в gemini.js, 13=outro)
#
# Фоновите файлове може да са ИЛИ кратки Veo видео клипове (ще се loop-нат
# ако са по-къси от аудиото), ИЛИ статични Nano Banana изображения (ще се
# анимират със letterbox+blur+бавен zoom — точно техниката от
# png_to_video.sh в new-online-project skill-а, само че с продължителност =
# реалната дължина на съответния .wav вместо фиксирани 8 секунди).
#
# Употреба:
#   ./assemble-youtube-video.sh <workdir> <output.mp4> [--portrait] [--music path/to/loop.mp3]
#
# --portrait   изход 1080x1920 (TikTok/Shorts) вместо подразбиращото се 1920x1080 (YouTube дълъг формат)
# --music      незадължителна фонова музика, зациклена и смесена тихо (-22dB) под говора
#
# Изисква ffmpeg + ffprobe (потвърдено налични в средата, версия 4.4.2).
# Провери резултата с ffprobe преди да го обявиш за готов — виж бележката
# накрая (feedback_no_trial_and_error: никога не докладвай "готово" без
# независима проверка).

set -euo pipefail

WORKDIR="${1:?Usage: assemble-youtube-video.sh <workdir> <output.mp4> [--portrait] [--music path]}"
OUTPUT="${2:?Usage: assemble-youtube-video.sh <workdir> <output.mp4> [--portrait] [--music path]}"
shift 2 || true

PORTRAIT=0
MUSIC=""
while [ $# -gt 0 ]; do
  case "$1" in
    --portrait) PORTRAIT=1; shift ;;
    --music) MUSIC="${2:?--music изисква път}"; shift 2 ;;
    *) echo "Непознат флаг: $1" >&2; exit 1 ;;
  esac
done

if [ "$PORTRAIT" = "1" ]; then
  WIDTH=1080; HEIGHT=1920
else
  WIDTH=1920; HEIGHT=1080
fi
FPS=25

AUDIO_DIR="$WORKDIR/audio"
BG_DIR="$WORKDIR/bg"
TMP_DIR="$WORKDIR/_tmp"
rm -rf "$TMP_DIR"
mkdir -p "$TMP_DIR"

if [ ! -d "$AUDIO_DIR" ] || [ ! -d "$BG_DIR" ]; then
  echo "Грешка: очаквах $AUDIO_DIR и $BG_DIR да съществуват." >&2
  exit 1
fi

# Имена на знаците за drawtext overlay-а (само сегменти 01-12, не intro/outro).
SIGN_NAMES=(Aries Taurus Gemini Cancer Leo Virgo Libra Scorpio Sagittarius Capricorn Aquarius Pisces)

CONCAT_LIST="$TMP_DIR/concat.txt"
> "$CONCAT_LIST"

for i in $(seq -w 0 13); do
  WAV="$AUDIO_DIR/${i}-"*.wav
  # glob може да не съвпадне с нищо — провери изрично, за да гръмне ясно
  # вместо ffmpeg да гърми по-надолу с неясна грешка "No such file".
  WAV_FILE=$(ls $WAV 2>/dev/null | head -n1 || true)
  if [ -z "$WAV_FILE" ]; then
    echo "Грешка: липсва аудио сегмент за индекс $i (очаквах $AUDIO_DIR/${i}-*.wav)" >&2
    exit 1
  fi

  BG_FILE=$(ls "$BG_DIR/${i}-"*.mp4 "$BG_DIR/${i}-"*.png "$BG_DIR/${i}-"*.jpg 2>/dev/null | head -n1 || true)
  if [ -z "$BG_FILE" ]; then
    echo "Грешка: липсва фонов файл за индекс $i (очаквах $BG_DIR/${i}-*.{mp4,png,jpg})" >&2
    exit 1
  fi

  DURATION=$(ffprobe -v error -show_entries format=duration -of csv=p=0 "$WAV_FILE")
  # ffprobe понякога връща с малка неточност/без десетична точка при .wav —
  # добавяме 0.05s padding, за да не се отреже последната сричка при -shortest.
  DURATION_PADDED=$(awk "BEGIN { printf \"%.3f\", $DURATION + 0.15 }")

  SEG_OUT="$TMP_DIR/seg-${i}.mp4"
  IS_IMAGE=0
  case "$BG_FILE" in
    *.png|*.jpg|*.jpeg) IS_IMAGE=1 ;;
  esac

  # Опционален текст на знака върху видеото — само за сегменти 01-12.
  DRAWTEXT_FILTER=""
  IDX_NUM=$((10#$i))
  if [ "$IDX_NUM" -ge 1 ] && [ "$IDX_NUM" -le 12 ]; then
    SIGN_LABEL="${SIGN_NAMES[$((IDX_NUM - 1))]}"
    # fontfile пропуснат нарочно (без хардкоднат системен път, който може да
    # липсва на друга машина) — ffmpeg drawtext пада тихо на default шрифта
    # ако е наличен, иначе целият drawtext блок се пропуска по-долу при грешка,
    # вместо да чупи цялото видео заради козметичен overlay.
    DRAWTEXT_FILTER=",drawtext=text='${SIGN_LABEL}':fontcolor=white@0.92:fontsize=64:x=(w-text_w)/2:y=h*0.82:box=1:boxcolor=black@0.35:boxborderw=20"
  fi

  if [ "$IS_IMAGE" = "1" ]; then
    # Статична снимка → letterbox+blur фон + бавен zoom, същата логика като
    # png_to_video.sh, но продължителността се определя от аудиото, не от
    # фиксиран параметър.
    FRAMES=$(awk "BEGIN { printf \"%d\", $DURATION_PADDED * $FPS }")
    ffmpeg -y -loop 1 -i "$BG_FILE" -i "$WAV_FILE" \
      -filter_complex "[0:v]scale=${WIDTH}:${HEIGHT}:force_original_aspect_ratio=increase,crop=${WIDTH}:${HEIGHT},gblur=sigma=25,eq=brightness=-0.15[bgv];[0:v]scale=${WIDTH}:${HEIGHT}:force_original_aspect_ratio=decrease[fgv];[bgv][fgv]overlay=(W-w)/2:(H-h)/2,zoompan=z='min(zoom+0.0004,1.04)':d=${FRAMES}:s=${WIDTH}x${HEIGHT}:fps=${FPS}${DRAWTEXT_FILTER}[outv]" \
      -map "[outv]" -map 1:a \
      -t "$DURATION_PADDED" -c:v libx264 -pix_fmt yuv420p -c:a aac -b:a 192k -shortest \
      -loglevel error \
      "$SEG_OUT" \
      || { echo "  (drawtext/zoompan неуспешен за сегмент $i, пробвам без надпис)" >&2; \
           ffmpeg -y -loop 1 -i "$BG_FILE" -i "$WAV_FILE" \
             -filter_complex "[0:v]scale=${WIDTH}:${HEIGHT}:force_original_aspect_ratio=increase,crop=${WIDTH}:${HEIGHT},gblur=sigma=25,eq=brightness=-0.15[bgv];[0:v]scale=${WIDTH}:${HEIGHT}:force_original_aspect_ratio=decrease[fgv];[bgv][fgv]overlay=(W-w)/2:(H-h)/2,zoompan=z='min(zoom+0.0004,1.04)':d=${FRAMES}:s=${WIDTH}x${HEIGHT}:fps=${FPS}[outv]" \
             -map "[outv]" -map 1:a -t "$DURATION_PADDED" -c:v libx264 -pix_fmt yuv420p -c:a aac -b:a 192k -shortest -loglevel error "$SEG_OUT"; }
  else
    # Видео клип (Veo) → зациклен ако е по-къс от аудиото, изрязан до точната
    # продължителност, letterbox-нат (не crop) към целевата резолюция за
    # да не отреже кадъра ако Veo клипът е в различно съотношение.
    ffmpeg -y -stream_loop -1 -i "$BG_FILE" -i "$WAV_FILE" \
      -filter_complex "[0:v]scale=${WIDTH}:${HEIGHT}:force_original_aspect_ratio=decrease,pad=${WIDTH}:${HEIGHT}:(ow-iw)/2:(oh-ih)/2:color=black${DRAWTEXT_FILTER}[outv]" \
      -map "[outv]" -map 1:a \
      -t "$DURATION_PADDED" -c:v libx264 -pix_fmt yuv420p -c:a aac -b:a 192k -shortest \
      -loglevel error \
      "$SEG_OUT" \
      || { echo "  (drawtext неуспешен за сегмент $i, пробвам без надпис)" >&2; \
           ffmpeg -y -stream_loop -1 -i "$BG_FILE" -i "$WAV_FILE" \
             -filter_complex "[0:v]scale=${WIDTH}:${HEIGHT}:force_original_aspect_ratio=decrease,pad=${WIDTH}:${HEIGHT}:(ow-iw)/2:(oh-ih)/2:color=black[outv]" \
             -map "[outv]" -map 1:a -t "$DURATION_PADDED" -c:v libx264 -pix_fmt yuv420p -c:a aac -b:a 192k -shortest -loglevel error "$SEG_OUT"; }
  fi

  echo "file '$(realpath "$SEG_OUT")'" >> "$CONCAT_LIST"
  echo "  сегмент $i готов: $DURATION_PADDED сек ($BG_FILE)"
done

# Слепваме всички сегменти. Всички имат идентичен кодек/резолюция/fps (зададени
# по-горе), затова concat demuxer може да работи без re-encode на самото
# слепване (-c copy) — по-бързо и без загуба на качество спрямо filter concat.
MERGED="$TMP_DIR/merged.mp4"
ffmpeg -y -f concat -safe 0 -i "$CONCAT_LIST" -c copy -loglevel error "$MERGED"

if [ -n "$MUSIC" ]; then
  if [ ! -f "$MUSIC" ]; then
    echo "Предупреждение: --music файлът '$MUSIC' не съществува, пропускам музиката." >&2
    cp "$MERGED" "$OUTPUT"
  else
    # Музиката се зацикля и мix-ва тихо (-22dB спрямо говора) под целия видео
    # файл. duration=first означава да спре когато видеото свърши, не когато
    # музиката свърши (иначе видеото продължава беззвучно ако музиката е по-къса).
    ffmpeg -y -i "$MERGED" -stream_loop -1 -i "$MUSIC" \
      -filter_complex "[1:a]volume=0.12[music];[0:a][music]amix=inputs=2:duration=first:dropout_transition=2[outa]" \
      -map 0:v -map "[outa]" -c:v copy -c:a aac -b:a 192k -movflags +faststart -loglevel error \
      "$OUTPUT"
  fi
else
  ffmpeg -y -i "$MERGED" -c copy -movflags +faststart -loglevel error "$OUTPUT"
fi

echo ""
echo "Готово: $OUTPUT"
echo "ЗАДЪЛЖИТЕЛНА проверка преди да обявиш видеото за готово (feedback_no_trial_and_error правило — не докладвай 'готово' без независима проверка):"
echo "  ffprobe -v error -select_streams v:0 -show_entries stream=width,height,duration,nb_frames -of csv=p=0 \"$OUTPUT\""
echo "  ffprobe -v error -select_streams a:0 -show_entries stream=codec_name,sample_rate -of csv=p=0 \"$OUTPUT\""
echo "Очаквано: ${WIDTH},${HEIGHT} резолюция, аудио поток наличен (aac), обща продължителност ~= сборът на всичките 14 сегмента отгоре."
