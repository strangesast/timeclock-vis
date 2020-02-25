#!/bin/bash
docker buildx build --platform linux/amd64,linux/arm64,linux/arm/v7 -f docker/server/Dockerfile -t strangesast/timeclock-vis_server  --push .
docker buildx build --platform linux/amd64,linux/arm64,linux/arm/v7 -f docker/nginx/Dockerfile -t strangesast/timeclock-vis_nginx  --push .
