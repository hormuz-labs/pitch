"""
Local Whisper transcription service.

Serves the contract the recording-editor tools expect
(.opencode/tools/recording-editor.ts):

  POST /transcribe  multipart form, field "file" (audio)
    -> { text, language, segments: [{ start, end, text, words: [...] }] }

  GET  /health      -> { status, model }

Runs faster-whisper (CTranslate2) on CPU with int8 quantization — no GPU needed.
The model is baked into the Docker image at build time (see Dockerfile), so cold
starts don't hit HuggingFace.
"""

import os
import tempfile

from fastapi import FastAPI, File, HTTPException, UploadFile
from faster_whisper import WhisperModel

MODEL_NAME = os.environ.get("WHISPER_MODEL", "small")
COMPUTE_TYPE = os.environ.get("WHISPER_COMPUTE_TYPE", "int8")

model = WhisperModel(MODEL_NAME, device="cpu", compute_type=COMPUTE_TYPE)
app = FastAPI(title="pitch-transcription")


@app.get("/health")
def health():
    return {"status": "ok", "model": MODEL_NAME}


@app.post("/transcribe")
async def transcribe(file: UploadFile = File(...)):
    suffix = os.path.splitext(file.filename or "audio.wav")[1] or ".wav"
    with tempfile.NamedTemporaryFile(delete=False, suffix=suffix) as tmp:
        tmp.write(await file.read())
        tmp_path = tmp.name
    try:
        segments_iter, info = model.transcribe(
            tmp_path,
            word_timestamps=True,
            # VAD skips non-speech audio — also kills Whisper's classic
            # silence/music hallucinations before they reach the transcript.
            vad_filter=True,
        )
        segments = []
        for seg in segments_iter:
            segments.append(
                {
                    "start": round(seg.start, 3),
                    "end": round(seg.end, 3),
                    "text": seg.text.strip(),
                    "words": [
                        {"word": w.word, "start": round(w.start, 3), "end": round(w.end, 3)}
                        for w in (seg.words or [])
                    ],
                }
            )
        return {
            "text": " ".join(s["text"] for s in segments),
            "language": info.language,
            "segments": segments,
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
    finally:
        os.unlink(tmp_path)
