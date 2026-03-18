#!/bin/bash
# Run this script once from your Termux terminal to initialize git and push to GitHub Pages
# Usage: bash setup_git_and_push.sh

set -e
cd "$(dirname "$0")"

echo "=== Initializing git repo ==="
git init
git config user.email "jiz41@users.noreply.github.com"
git config user.name "Jiz41"

echo "=== Adding remote ==="
git remote add origin https://github.com/Jiz41/kibitsureact.git 2>/dev/null || \
  git remote set-url origin https://github.com/Jiz41/kibitsureact.git

echo "=== Committing ==="
git add index.html
git commit -m "feat: Phase 1 — Kibitsu oni-battle game (Phaser.js)

- 縦画面 390x844 (top 45% battle, bottom 55% UI)
- 鬼 10体 / WAVE、2秒間隔スポーン
- キビツ自動水弾（射程内先頭に単体ダメージ）
- 戦闘エリアタップで斬撃（即時単体ダメージ）
- WAVE全滅クリア → 次WAVE
- HP0でゲームオーバー → リスタート
- GitHub Pages 対応 (index.html at root)"

echo "=== Pushing ==="
git branch -M main
git push -u origin main --force

echo ""
echo "Done! GitHub Pages URL: https://Jiz41.github.io/kibitsureact/"
echo ""

# Discord notification
curl -s -X POST "https://discord.com/api/webhooks/1483328438327840829/tN91CbY625115qeGMFNb3m2EIlUYvkGTfqVb_WPp5xU5ptS1QpCUmcT90c4AtpcyipUY" \
  -H "Content-Type: application/json" \
  -d '{"content": "あがったよ！"}' && echo "Discord notification sent."
