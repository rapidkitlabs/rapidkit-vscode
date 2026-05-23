import React from 'react';
import { IncidentPhase, PHASE_LABELS, PHASE_SEQUENCE } from '../state/studioState';
import {
    borderRadius,
    colorTokens,
    motionTokens,
    spacing,
    typography,
    transitions,
} from '../styles/designTokens';

interface PhaseStepperProps {
    currentPhase: IncidentPhase;
    compactMode?: boolean;
    onSelectPhase: (phase: IncidentPhase) => void;
}

export const PhaseStepper: React.FC<PhaseStepperProps> = ({
    currentPhase,
    compactMode: _compactMode = false,
    onSelectPhase,
}) => {
    const activeIndex = PHASE_SEQUENCE.indexOf(currentPhase);

    return (
        <nav
            aria-label="Incident workflow phases"
            style={{
                display: 'flex',
                alignItems: 'stretch',
                borderBottom: `1px solid ${colorTokens.border.subtle}`,
                backgroundColor: colorTokens.surface1,
                padding: 0,
                gap: 0,
                height: '42px',
                overflowX: 'auto',
                overflowY: 'hidden',
                WebkitOverflowScrolling: 'touch',
                animation: `studioEnterUp ${motionTokens.durations.stepperEnter}ms ${motionTokens.easing.emphasized} ${motionTokens.delays.stepperAfterHeader}ms both`,
            }}
        >
            {PHASE_SEQUENCE.map((phase, idx) => {
                const isActive = phase === currentPhase;
                const isDone = idx < activeIndex;

                return (
                    <button
                        key={phase}
                        type="button"
                        aria-label={`Phase ${idx + 1}: ${PHASE_LABELS[phase]}`}
                        aria-current={isActive ? 'step' : undefined}
                        onClick={() => onSelectPhase(phase)}
                        style={{
                            flex: 1,
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            gap: spacing.sm,
                            padding: `0 ${spacing.sm}`,
                            border: 'none',
                            borderBottom: `2px solid ${isActive ? colorTokens.primary : 'transparent'}`,
                            borderRight: idx < PHASE_SEQUENCE.length - 1 ? `1px solid ${colorTokens.border.subtle}` : 'none',
                            background: isActive ? `${colorTokens.primary}0d` : 'transparent',
                            cursor: 'pointer',
                            transition: transitions.microInteraction,
                            whiteSpace: 'nowrap',
                            height: '100%',
                        }}
                        onMouseEnter={(e) => {
                            if (!isActive) {
                                e.currentTarget.style.background = `${colorTokens.primary}08`;
                            }
                        }}
                        onMouseLeave={(e) => {
                            if (!isActive) {
                                e.currentTarget.style.background = 'transparent';
                            }
                        }}
                    >
                        <span
                            style={{
                                width: '18px',
                                height: '18px',
                                borderRadius: '50%',
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                                backgroundColor: isDone
                                    ? colorTokens.health.ok
                                    : isActive
                                        ? colorTokens.primary
                                        : colorTokens.surface4,
                                color: isDone || isActive ? colorTokens.root : colorTokens.text.quaternary,
                                fontSize: '11px',
                                fontWeight: 700,
                                flexShrink: 0,
                            }}
                        >
                            {isDone ? '✓' : idx + 1}
                        </span>
                        <span
                            style={{
                                ...typography.captionSmall,
                                color: isActive ? colorTokens.text.primary : colorTokens.text.tertiary,
                                fontWeight: isActive ? 600 : 400,
                            }}
                        >
                            {PHASE_LABELS[phase]}
                        </span>
                    </button>
                );
            })}
        </nav>
    );
};
