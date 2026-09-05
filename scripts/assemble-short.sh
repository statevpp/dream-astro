#!/bin/bash
# assemble-short.sh — сглобява ЕДИН Lumaris Shorts клип (един знак) от
# audio/short.wav + bg/short.png в готов вертикален .mp4.
#
# Много по-опростена версия на assemble-youtube-video.sh (стария 14-сегментен
# епизод-монтажник, оставен непокътнат в repo-то за референция) — тук няма
# нужда от concat на сегменти, само ЕДНА статична снимка + ЕДИН .wav, точно
# както при сестринския канал proof-in-numbers/scripts/assemble_video.sh.
# Реизползва СЪЩАТА доказана ffmpeg техника (letterbox+blur фон + бавен zoom
# на статичното изображение, виж assemble-youtube-video.sh за пълната
# история/поуките от POC теста на 18.07.2026 — същите капани важат тук:
# ffmpeg трябва изрично инсталиран на runner-а, drawtext чупи се тихо на "%"
# в текста и т.н., затова тук няма drawtext изобщо — вертикален Shorts клип
# без надпис върху видеото, само говор + движещ се фон, огледално на
# proof-in-numbers (там надписите идват от самия chart render, тук няма
# еквивалент, затова е чист аудио+визуал без overlay текст).
#
# Употреба: ./assemble-short.sh <workdir> <output.mp4>
#   <workdir> трябва да съдържа audio/short.wav и bg/short.png
#
# Изисква ffmpeg + ffprobe.

set -euo pipefail

WORKDIR="${1:?Usage: assemble-short.sh <workdir> <output.mp4>}"
OUTPUT="${2:?Usage: assemble-short.sh <workdir> <output.mp4>}"

WIDTH=1080
HEIGHT=1920
FPS=25

WAV_FILE="$WORKDIR/audio/short.wav"
BG_FILE="$WORKDIR/bg/short.png"

if [ ! -f "$WAV_FILE" ]; then
  echo "Грешка: липсва $WAV_FILE" >&2
  exit 1
fi
if [ ! -f "$BG_FILE" ]; then
  echo "Грешка: липсва $BG_FILE" >&2
  exit 1
fi

DURATION=$(ffprobe -v error -show_entries format=duration -of csv=p=0 "$WAV_FILE")
# +0.15s padding — същата поука като в assemble-youtube-video.sh: ffprobe
# понякога дава леко неточна продължителност за .wav, паднинг пази да не се
# отреже последната сричка при -shortest.
DURATION_PADDED=$(awk "BEGIN { printf \"%.3f\", $DURATION + 0.15 }")
FRAMES=$(awk "BEGIN { printf \"%d\", $DURATION_PADDED * $FPS }")

ffmpeg -y -loop 1 -i "$BG_FILE" -i "$WAV_FILE" \
  -filter_complex "[0:v]scale=${WIDTH}:${HEIGHT}:force_original_aspect_ratio=increase,crop=${WIDTH}:${HEIGHT},gblur=sigma=25,eq=brightness=-0.15[bgv];[0:v]scale=${WIDTH}:${HEIGHT}:force_original_aspect_ratio=decrease[fgv];[bgv][fgv]overlay=(W-w)/2:(H-h)/2,zoompan=z='min(zoom+0.0004,1.04)':d=${FRAMES}:s=${WIDTH}x${HEIGHT}:fps=${FPS}[outv]" \
  -map "[outv]" -map 1:a \
  -t "$DURATION_PADDED" -c:v libx264 -pix_fmt yuv420p -c:a aac -b:a 192k -shortest \
  -movflags +faststart \
  -loglevel error \
  "$OUTPUT"

echo "Готово: $OUTPUT ($DURATION_PADDED сек)"
echo "ЗАДЪЛЖИТЕЛНА проверка преди да обявиш видеото за готово (feedback_no_trial_and_error правило):"
echo "  ffprobe -v error -select_streams v:0 -show_entries stream=width,height,duration -of csv=p=0 \"$OUTPUT\""
echo "  ffprobe -v error -select_streams a:0 -show_entries stream=codec_name,sample_rate -of csv=p=0 \"$OUTPUT\""
echo "Очаквано: ${WIDTH},${HEIGHT} резолюция, аудио поток наличен (aac), продължителност ~= ${DURATION_PADDED}."
