#!/bin/bash

echo "uploading: $LOCAL_FILE"

echo "to $DRONE_PI_USER at $DRONE_PI_IP"

rsync -az $LOCAL_FILE $DRONE_PI_USER@$DRONE_PI_IP:$REMOTE_DEST

echo "Upload Complete!"