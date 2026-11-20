#!/usr/bin/env bash
# Render build step: Python API + the built React app that serve.py hosts.
set -euo pipefail

python -m pip install --upgrade pip
pip install -r backend/requirements.txt
# --no-deps: dlib-bin and face_recognition_models are installed above, so pip
# must not try to compile dlib from source.
pip install face_recognition --no-deps

cd frontend
npm ci
npm run build
