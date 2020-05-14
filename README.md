# Timeclock
[![Build Status](https://travis-ci.com/strangesast/timeclock-vis.svg?branch=master)](https://travis-ci.com/strangesast/timeclock-vis)  
An app to view current and historical shift stats interactively.

- [x] Display who & when
- [x] Each person view
- [x] Use real data
- [/] Fix broken daemon
- [ ] Angularify into web components
- [ ] Add testing
- [/] ML


# Getting started
1. Create a `config.ini` file in `server/` (using the example config file `config.ini.example`) with AMG credentials
2. docker-compose up -d
3. Hope everything works

# Repository files overview
## `server/`
contains python aiohttp application and timeclock monitoring files

## `client/`
webpack html / javascript / d3 website

## `docker/`
docker configuration files (except docker-compose.yml)

## `ml/`
early stages of tensorflow app
