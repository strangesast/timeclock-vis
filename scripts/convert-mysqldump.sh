#!/bin/bash
# when dumping on Windows there's an incompatibility with unix systems?
# can be avoided with --binary-mode
iconv -f utf-16 -t utf-8 dump.sql > dump_utf8.sql
