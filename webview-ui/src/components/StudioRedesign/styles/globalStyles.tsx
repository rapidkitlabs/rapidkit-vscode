/**
 * Global Styles - Grid Baseline & Typography System
 * Establishes 8px grid baseline and typography hierarchy
 */

import React from 'react';
import { colorTokens, fontTokens, gridBaseline, typography, spacing } from './designTokens';

export const GlobalStyles: React.FC = () => {
    return (
        <style>{`
/* CSS Reset & Baseline */
* {
    margin: 0;
    padding: 0;
    box-sizing: border-box;
}

html, body {
    font-family: ${fontTokens.ui};
    -webkit-font-smoothing: antialiased;
    -moz-osx-font-smoothing: grayscale;
    font-size: 13px;
    line-height: 1.5;
    color: ${colorTokens.text.primary};
    background: ${colorTokens.canvas};
    /* 8px baseline grid */
    --baseline: ${gridBaseline}px;
}

body {
    position: relative;
    overflow: hidden;
}

body::before {
    content: none;
    position: fixed;
    inset: 0;
    background: none;
    pointer-events: none;
    opacity: 0;
}

body::after {
    content: none;
    position: fixed;
    inset: 0;
    background-image: none;
    background-size: auto;
    mask-image: none;
    pointer-events: none;
    opacity: 0;
}

body.vscode-light::after,
body.vscode-high-contrast-light::after {
    opacity: 0.05;
}

body.vscode-light ::-webkit-scrollbar-track,
body.vscode-high-contrast-light ::-webkit-scrollbar-track {
    background: ${colorTokens.surface2};
}

body.vscode-light ::-webkit-scrollbar-thumb,
body.vscode-high-contrast-light ::-webkit-scrollbar-thumb {
    background: ${colorTokens.border.medium};
}

body.vscode-light ::-webkit-scrollbar-thumb:hover,
body.vscode-high-contrast-light ::-webkit-scrollbar-thumb:hover {
    background: ${colorTokens.border.strong};
}

#root {
    position: relative;
    isolation: isolate;
}

/* Typography System */
h1 {
    font-size: ${typography.h1.fontSize};
    font-weight: ${typography.h1.fontWeight};
    line-height: ${typography.h1.lineHeight};
    letter-spacing: ${typography.h1.letterSpacing};
}

h2 {
    font-size: ${typography.h2.fontSize};
    font-weight: ${typography.h2.fontWeight};
    line-height: ${typography.h2.lineHeight};
    letter-spacing: ${typography.h2.letterSpacing};
}

h3 {
    font-size: ${typography.h3.fontSize};
    font-weight: ${typography.h3.fontWeight};
    line-height: ${typography.h3.lineHeight};
}

p {
    font-size: ${typography.body.fontSize};
    line-height: ${typography.body.lineHeight};
    margin-bottom: calc(var(--baseline) * 1.5);
}

small {
    font-size: ${typography.caption.fontSize};
    line-height: ${typography.caption.lineHeight};
    color: ${colorTokens.text.tertiary};
}

code, pre {
    font-family: ${fontTokens.mono};
    font-size: ${typography.code.fontSize};
    background: ${colorTokens.surface3};
    padding: ${spacing.xs} ${spacing.sm};
    border-radius: 6px;
}

/* Scrollbar Styling */
::-webkit-scrollbar {
    width: 8px;
    height: 8px;
}

::-webkit-scrollbar-track {
    background: ${colorTokens.surface2};
}

::-webkit-scrollbar-thumb {
    background: ${colorTokens.border.medium};
    border-radius: 4px;
}

::-webkit-scrollbar-thumb:hover {
    background: ${colorTokens.border.strong};
}

/* Button Reset */
button {
    font-family: inherit;
    font-size: inherit;
    cursor: pointer;
    border: none;
    background: none;
}

button:focus-visible {
    outline: 2px solid ${colorTokens.primary};
    outline-offset: 2px;
}

/* Input Reset */
input, textarea, select {
    font-family: inherit;
    font-size: inherit;
    color: inherit;
}

input::placeholder, textarea::placeholder {
    color: ${colorTokens.text.tertiary};
}

select {
    appearance: none;
}

button, input, textarea, select {
    transition: color 120ms cubic-bezier(0.4, 0, 0.2, 1), background-color 120ms cubic-bezier(0.4, 0, 0.2, 1), border-color 120ms cubic-bezier(0.4, 0, 0.2, 1), box-shadow 220ms cubic-bezier(0.22, 1, 0.36, 1), transform 220ms cubic-bezier(0.22, 1, 0.36, 1);
}

.studio-glass-card {
    background: ${colorTokens.surface3};
    backdrop-filter: none;
    border: 1px solid ${colorTokens.border.medium};
    box-shadow: none;
}

body.vscode-high-contrast,
body.vscode-high-contrast-light {
    text-shadow: none;
}

body.vscode-high-contrast::before,
body.vscode-high-contrast-light::before,
body.vscode-high-contrast::after,
body.vscode-high-contrast-light::after {
    opacity: 0.06;
}

body.vscode-high-contrast button,
body.vscode-high-contrast-light button,
body.vscode-high-contrast input,
body.vscode-high-contrast-light input,
body.vscode-high-contrast textarea,
body.vscode-high-contrast-light textarea,
body.vscode-high-contrast select,
body.vscode-high-contrast-light select {
    border-color: ${colorTokens.border.strong};
}

body.vscode-high-contrast button:focus-visible,
body.vscode-high-contrast-light button:focus-visible,
body.vscode-high-contrast input:focus-visible,
body.vscode-high-contrast-light input:focus-visible,
body.vscode-high-contrast textarea:focus-visible,
body.vscode-high-contrast-light textarea:focus-visible,
body.vscode-high-contrast select:focus-visible,
body.vscode-high-contrast-light select:focus-visible {
    outline-width: 3px;
}

/* Selection */
::selection {
    background: ${colorTokens.primaryInverse};
    color: ${colorTokens.text.primary};
}

@keyframes pulse {
    0%, 100% {
        transform: scale(1);
        opacity: 0.92;
    }
    50% {
        transform: scale(1.2);
        opacity: 1;
    }
}

@keyframes studioEnterUp {
    0% {
        opacity: 0;
        transform: translateY(10px);
    }
    100% {
        opacity: 1;
        transform: translateY(0);
    }
}

@keyframes studioFadeIn {
    0% {
        opacity: 0;
    }
    100% {
        opacity: 1;
    }
}

@media (prefers-reduced-motion: reduce) {
    *, *::before, *::after {
        animation-duration: 1ms !important;
        animation-iteration-count: 1 !important;
        transition-duration: 1ms !important;
        scroll-behavior: auto !important;
    }
}

@media (forced-colors: active) {
    body::before,
    body::after {
        content: none;
    }

    .studio-glass-card {
        background: Canvas;
        border-color: ButtonBorder;
        box-shadow: none;
    }

    button,
    input,
    textarea,
    select {
        forced-color-adjust: auto;
        border-color: ButtonBorder;
    }

    button:focus-visible,
    input:focus-visible,
    textarea:focus-visible,
    select:focus-visible {
        outline: 2px solid Highlight;
        outline-offset: 2px;
    }
}
        `}</style>
    );
};
