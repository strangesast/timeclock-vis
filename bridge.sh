#!/bin/bash
ssh -L 3003:localhost:3003 -L 3306:localhost:3306 work 'ssh -L 3003:localhost:3003 -L 3306:localhost:3306 technical@10.0.0.62 -N'
