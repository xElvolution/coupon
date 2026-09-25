#!/bin/bash
# restart the production server on 3460
cd /workspace/coupon
PID=$(ss -ltnp | grep ':3460 ' | grep -o 'pid=[0-9]*' | cut -d= -f2)
[ -n "$PID" ] && kill $PID && sleep 1
nohup bun run start --port 3460 > /tmp/coupon.log 2>&1 &
sleep 4
