#!/usr/bin/bash
# weekly-cleanup.sh
echo "古いデプロイメント（1週間以上）をチェック..."
vercel ls | grep -E "(7d|[0-9]+w|[0-9]+mo)" | head -n 10 | xargs -I {} vercel rm {}