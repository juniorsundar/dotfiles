#!/bin/bash

# A script to replace hex color codes in a file.

# Check if a file was provided as an argument.
if [ -z "$1" ]; then
    echo "Usage: $0 <file_to_process>"
    exit 1
fi

# Store the file path from the first argument.
FILE="$1"

# Check if the file actually exists before trying to modify it.
if [ ! -f "$FILE" ]; then
    echo "Error: File '$FILE' not found."
    exit 1
fi

echo "🎨 Processing replacements in '$FILE'..."

# Use sed to perform in-place replacement.
# The -i flag modifies the file directly.
# Each -e flag specifies a substitution expression 's/old/new/g'.
sed -i \
    -e 's/#24273a/#16181a/g' \
    -e 's/#8aadf4/#5ea1ff/g' \
    -e 's/#181926/#3c4048/g' \
    -e 's/#f0c6c6/#ff9f9f/g' \
    -e 's/#a6da95/#5eff6c/g' \
    -e 's/#b7bdf8/#ff5ef1/g' \
    -e 's/#1e2030/#1e2124/g' \
    -e 's/#ee99a0/#d96666/g' \
    -e 's/#c6a0f6/#bd5eff/g' \
    -e 's/#6e738d/#474a55/g' \
    -e 's/#8087a2/#5a5e6b/g' \
    -e 's/#939ab7/#6e7280/g' \
    -e 's/#f5a97f/#ffbd5e/g' \
    -e 's/#f5bde6/#ff5ea0/g' \
    -e 's/#ed8796/#ff6e5e/g' \
    -e 's/#f4dbd6/#ffd1dc/g' \
    -e 's/#7dc4e4/#4a90e2/g' \
    -e 's/#91d7e3/#5ef1ff/g' \
    -e 's/#a5adcb/#8a8e99/g' \
    -e 's/#b8c0e0/#a0a4b8/g' \
    -e 's/#363a4f/#26282e/g' \
    -e 's/#494d64/#2e3138/g' \
    -e 's/#5b6078/#363940/g' \
    -e 's/#8bd5ca/#64d8cb/g' \
    -e 's/#cad3f5/#ffffff/g' \
    -e 's/#eed49f/#f1ff5e/g' \
    "$FILE"

echo "✅ Replacements complete."
