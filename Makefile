.PHONY: help dev build package clean setup test

help:
	@echo "VTF Audio Extension - Available commands:"
	@echo "  make setup    - Initial project setup"
	@echo "  make dev      - Start development mode"
	@echo "  make build    - Build the extension"
	@echo "  make package  - Build and create .zip"
	@echo "  make clean    - Remove build artifacts"
	@echo "  make test     - Run tests"

setup:
	npm run setup

dev:
	npm run dev

build:
	npm run build

package:
	npm run package

clean:
	npm run clean

test:
	npm run test 