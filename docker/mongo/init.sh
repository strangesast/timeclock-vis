#!/usr/bin/env bash
mongo admin --host localhost \
  -u root \
  -p password \
  --eval "db.createUser({user: 'user', pwd: 'password', roles: [{role: 'readWrite', db: 'timeclock'}]});"
