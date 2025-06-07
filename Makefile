# Makefile for VTF Audio Extension

.PHONY: all clean build start package

all: build

clean:
	rm -rf dist
	rm -f vtf-audio-extension.zip

build:
	npm run build

start:
	npm start 

package: build
	@echo "Creating extension package..."
	cd dist && zip -r ../vtf-audio-extension.zip . -x "*.DS_Store" -x "__MACOSX/*"
	@echo "Extension packaged as vtf-audio-extension.zip" 