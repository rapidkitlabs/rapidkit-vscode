#!/bin/bash
# Enable the new Incident Studio vNext UI for development/testing

# This script enables the vNext UI for local development
# To use: Open browser console in VS Code webview and run:
# localStorage.setItem('incident-studio-ui-version', 'vnext');
# Then reload the extension

echo "To enable Studio vNext UI:"
echo "1. Open any webview panel in VS Code extension"
echo "2. Open browser DevTools (Ctrl+Shift+I or Cmd+Shift+I)"
echo "3. Paste in console:"
echo "   localStorage.setItem('incident-studio-ui-version', 'vnext');"
echo ""
echo "4. Reload the webview or restart VS Code"
echo ""
echo "To revert to legacy UI:"
echo "   localStorage.setItem('incident-studio-ui-version', 'legacy');"
