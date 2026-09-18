#!/bin/sh
set -e
cd "$(dirname "$0")"
npx -y @vscode/vsce package
