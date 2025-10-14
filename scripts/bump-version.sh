#!/bin/bash
# Version bumping script for AI Vault Assistant
# Usage: ./scripts/bump-version.sh [patch|minor|major]

set -e

# Check if version type is provided
if [ -z "$1" ]; then
    echo "Usage: $0 [patch|minor|major]"
    echo ""
    echo "Examples:"
    echo "  $0 patch   # 0.1.0 -> 0.1.1 (bug fixes)"
    echo "  $0 minor   # 0.1.0 -> 0.2.0 (new features)"
    echo "  $0 major   # 0.1.0 -> 1.0.0 (breaking changes)"
    exit 1
fi

VERSION_TYPE=$1

# Get current version from manifest.json
CURRENT_VERSION=$(grep '"version"' manifest.json | head -1 | sed 's/.*"version": "\(.*\)".*/\1/')
echo "Current version: $CURRENT_VERSION"

# Split version into parts
IFS='.' read -r -a VERSION_PARTS <<< "$CURRENT_VERSION"
MAJOR="${VERSION_PARTS[0]}"
MINOR="${VERSION_PARTS[1]}"
PATCH="${VERSION_PARTS[2]}"

# Calculate new version
case $VERSION_TYPE in
    patch)
        PATCH=$((PATCH + 1))
        ;;
    minor)
        MINOR=$((MINOR + 1))
        PATCH=0
        ;;
    major)
        MAJOR=$((MAJOR + 1))
        MINOR=0
        PATCH=0
        ;;
    *)
        echo "Error: Invalid version type '$VERSION_TYPE'"
        echo "Must be one of: patch, minor, major"
        exit 1
        ;;
esac

NEW_VERSION="${MAJOR}.${MINOR}.${PATCH}"
echo "New version: $NEW_VERSION"

# Confirm with user
read -p "Update version to $NEW_VERSION? (y/n) " -n 1 -r
echo
if [[ ! $REPLY =~ ^[Yy]$ ]]; then
    echo "Aborted"
    exit 1
fi

# Update manifest.json
sed -i.bak "s/\"version\": \"$CURRENT_VERSION\"/\"version\": \"$NEW_VERSION\"/" manifest.json
rm manifest.json.bak

# Update versions.json
if [ -f versions.json ]; then
    # Add new version entry
    # Remove the closing brace, add new entry, add closing brace back
    sed -i.bak '$ d' versions.json  # Remove last line (})
    
    # Check if file has content besides opening brace
    if [ $(wc -l < versions.json) -gt 1 ]; then
        # Add comma to previous line if there are existing entries
        sed -i.bak '$ s/$/,/' versions.json
    fi
    
    echo "  \"$NEW_VERSION\": \"0.9.0\"" >> versions.json
    echo "}" >> versions.json
    rm versions.json.bak
else
    # Create versions.json if it doesn't exist
    echo "{" > versions.json
    echo "  \"$NEW_VERSION\": \"0.9.0\"" >> versions.json
    echo "}" >> versions.json
fi

# Update package.json
if [ -f package.json ]; then
    sed -i.bak "s/\"version\": \"$CURRENT_VERSION\"/\"version\": \"$NEW_VERSION\"/" package.json
    rm package.json.bak
fi

echo ""
echo "✅ Version updated to $NEW_VERSION in:"
echo "   - manifest.json"
echo "   - versions.json"
echo "   - package.json"
echo ""
echo "Next steps:"
echo "  1. Review the changes: git diff"
echo "  2. Commit: git add manifest.json versions.json package.json"
echo "  3. Commit: git commit -m 'Bump version to $NEW_VERSION'"
echo "  4. Create PR and merge to main"
echo "  5. Tag: git tag $NEW_VERSION && git push origin $NEW_VERSION"

