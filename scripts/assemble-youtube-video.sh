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

# -----------------------------------------------------------------------
# Thumbnail(и) — генерират се ВИНАГИ ДВЕ (правило от 18.07.2026): едно
# YouTube thumbnail (1280x720) и едно TikTok cover (1080x1920), визуално
# еднакви (същия bg, същия текст, същия box стил), само в различен формат —
# защото TikTok cover-ът е ПОРТРЕТЕН (крои се от TikTok до 1:1 за грид-а),
# различен от YouTube-овия landscape thumbnail. Генерират се САМО при
# landscape извикването (не се дублират и за --portrait), от
# bg/00-*.{png,jpg} + $WORKDIR/thumbnail.txt (написан от
# generateYoutubeScript() в gemini.js). НУЛЕВА допълнителна Gemini такса —
# преизползва вече платена снимка, само overlay текст с ffmpeg drawtext
# (същата техника като SIGN_LABEL по-горе).
#
# ЗАЩО Е ВАЖНО: thumbnail-ът е ОТДЕЛНО изображение, което YouTube/TikTok
# показват ПРЕДИ клик (не е "част" от самото видео) — то определя CTR
# (click-through rate), не съдържанието на видеото. Преди тази промяна
# thumbnail.txt съдържаше само предложен текст без реално изобразен файл.
#
# Санитизираме текста вместо да разчитаме на перфектен escape за ffmpeg —
# апострофи/двоеточия/проценти заменяме с безопасен еквивалент, защото
# drawtext филтърът мълчаливо чупи ЦЕЛИЯ overlay при определени символи
# (напр. "%" дава "Stray %" грешка дори escape-нат като "\%" или "%%" —
# потвърдено с реален тест, текстът изчезва напълно вместо частично).
if [ "$PORTRAIT" = "0" ] && [ -f "$WORKDIR/thumbnail.txt" ]; then
  THUMB_BG=$(ls "$BG_DIR/00-"*.png "$BG_DIR/00-"*.jpg "$BG_DIR/00-"*.jpeg 2>/dev/null | head -n1 || true)
  if [ -n "$THUMB_BG" ]; then
    THUMB_OUT="$WORKDIR/thumbnail.png"
    THUMB_TEXT_RAW=$(tr -d '\n\r' < "$WORKDIR/thumbnail.txt" | tr '[:lower:]' '[:upper:]')
    THUMB_TEXT_SAFE=$(printf '%s' "$THUMB_TEXT_RAW" | sed -e "s/['’‘]//g" -e 's/:/ -/g' -e 's/%/ PCT/g' -e 's/\\/ /g')
    THUMB_TEXT_SAFE=$(printf '%s' "$THUMB_TEXT_SAFE" | tr -s ' ')
    THUMB_LEN=${#THUMB_TEXT_SAFE}
    if   [ "$THUMB_LEN" -le 12 ]; then THUMB_FONTSIZE=140
    elif [ "$THUMB_LEN" -le 18 ]; then THUMB_FONTSIZE=118
    elif [ "$THUMB_LEN" -le 24 ]; then THUMB_FONTSIZE=96
    elif [ "$THUMB_LEN" -le 32 ]; then THUMB_FONTSIZE=78
    else THUMB_FONTSIZE=62
    fi

    ffmpeg -y -i "$THUMB_BG" \
      -vf "scale=1280:720:force_original_aspect_ratio=increase,crop=1280:720,drawtext=text='${THUMB_TEXT_SAFE}':fontcolor=white:fontsize=${THUMB_FONTSIZE}:x=(w-text_w)/2:y=(h-text_h)/2:box=1:boxcolor=black@0.45:boxborderw=30" \
      -frames:v 1 -loglevel error "$THUMB_OUT" \
      || { echo "  (thumbnail drawtext неуспешен, запазвам само фона без текст)" >&2; \
           ffmpeg -y -i "$THUMB_BG" -vf "scale=1280:720:force_original_aspect_ratio=increase,crop=1280:720" -frames:v 1 -loglevel error "$THUMB_OUT"; }
    echo "  thumbnail готов: $THUMB_OUT (текст: \"$THUMB_TEXT_SAFE\", fontsize $THUMB_FONTSIZE)"

    # TikTok cover (добавено 18.07.2026) — ВИНАГИ се генерира заедно с
    # YouTube thumbnail-а, ВИЗУАЛНО еднакъв (същия bg, същия текст, същия
    # box стил), но в TikTok's cover формат: 1080x1920 (9:16 портрет),
    # крои се от TikTok до 1:1 квадрат за профилната грид-мрежа. Fontsize-ът
    # се скалира пропорционално по 1080/1280 (по-тясна снимка), за да остане
    # ТОЧНО СЪЩОТО визуално съотношение текст/кадър като на YouTube версията
    # — не просто копие на числото, защото при по-тясна снимка същия fontsize
    # би стърчал извън кадъра.
    TIKTOK_OUT="$WORKDIR/thumbnail-tiktok.png"
    TIKTOK_FONTSIZE=$(( THUMB_FONTSIZE * 1080 / 1280 ))

    ffmpeg -y -i "$THUMB_BG" \
      -vf "scale=1080:1920:force_original_aspect_ratio=increase,crop=1080:1920,drawtext=text='${THUMB_TEXT_SAFE}':fontcolor=white:fontsize=${TIKTOK_FONTSIZE}:x=(w-text_w)/2:y=(h-text_h)/2:box=1:boxcolor=black@0.45:boxborderw=30" \
      -frames:v 1 -loglevel error "$TIKTOK_OUT" \
      || { echo "  (TikTok cover drawtext неуспешен, запазвам само фона без текст)" >&2; \
           ffmpeg -y -i "$THUMB_BG" -vf "scale=1080:1920:force_original_aspect_ratio=increase,crop=1080:1920" -frames:v 1 -loglevel error "$TIKTOK_OUT"; }
    echo "  TikTok cover готов: $TIKTOK_OUT (текст: \"$THUMB_TEXT_SAFE\", fontsize $TIKTOK_FONTSIZE)"
  else
    echo "  Предупреждение: няма bg/00-*.png/jpg — thumbnail(и) пропуснати." >&2
  fi
fi

echo ""
echo "Готово: $OUTPUT"
if [ "$PORTRAIT" = "0" ] && [ -f "$WORKDIR/thumbnail.png" ]; then
  echo "Готово: $WORKDIR/thumbnail.png (YouTube thumbnail, 1280x720)"
fi
if [ "$PORTRAIT" = "0" ] && [ -f "$WORKDIR/thumbnail-tiktok.png" ]; then
  echo "Готово: $WORKDIR/thumbnail-tiktok.png (TikTok cover, 1080x1920)"
fi
echo "ЗАДЪЛЖИТЕЛНА проверка преди да обявиш видеото за готово (feedback_no_trial_and_error правило — не докладвай 'готово' без независима проверка):"
echo "  ffprobe -v error -select_streams v:0 -show_entries stream=width,height,duration,nb_frames -of csv=p=0 \"$OUTPUT\""
echo "  ffprobe -v error -select_streams a:0 -show_entries stream=codec_name,sample_rate -of csv=p=0 \"$OUTPUT\""
echo "Очаквано: ${WIDTH},${HEIGHT} резолюция, аудио поток наличен (aac), обща продължителност ~= сборът на всичките 14 сегмента отгоре."
