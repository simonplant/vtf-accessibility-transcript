# Makefile for VTF Audio Extension

.PHONY: all clean build start

all: build

clean:
	rm -rf dist

build:
	npm run build

start:
	npm start 