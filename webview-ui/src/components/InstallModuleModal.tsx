import { X, Package, Folder, Download, AlertCircle } from 'lucide-react';
import type { ModuleData, WorkspaceStatus } from '@/types';

interface InstallModuleModalProps {
  isOpen: boolean;
  module: ModuleData | null;
  workspaceStatus: WorkspaceStatus;
  onClose: () => void;
  onConfirm: () => void;
}

export function InstallModuleModal({
  isOpen,
  module,
  workspaceStatus,
  onClose,
  onConfirm,
}: InstallModuleModalProps) {
  if (!isOpen || !module) {
    return null;
  }

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      onConfirm();
    } else if (e.key === 'Escape') {
      onClose();
    }
  };

  const isInstalled = workspaceStatus.installedModules?.some((m) => m.slug === module.slug);
  const installedVersion = workspaceStatus.installedModules?.find(
    (m) => m.slug === module.slug
  )?.version;

  return (
    <>
      {/* Backdrop */}
      <div
        className="modal-backdrop"
        onClick={onClose}
        style={{
          position: 'fixed',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          backgroundColor: 'rgba(0, 0, 0, 0.5)',
          backdropFilter: 'blur(4px)',
          zIndex: 9998,
          animation: 'fadeIn 0.2s ease-out',
        }}
      />

      {/* Modal */}
      <div
        className="modal-container"
        onKeyDown={handleKeyPress}
        tabIndex={0}
        style={{
          position: 'fixed',
          top: '50%',
          left: '50%',
          transform: 'translate(-50%, -50%)',
          zIndex: 9999,
          animation: 'slideUp 0.3s ease-out',
          outline: 'none',
        }}
      >
        <div
          className="modal-content"
          style={{
            backgroundColor: 'var(--vscode-editor-background)',
            border: '1px solid var(--vscode-panel-border)',
            borderRadius: '12px',
            width: '540px',
            maxWidth: '90vw',
            boxShadow: '0 20px 60px rgba(0, 0, 0, 0.3)',
          }}
        >
          {/* Header */}
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              padding: '20px 24px',
              borderBottom: '1px solid var(--vscode-panel-border)',
              background: isInstalled
                ? 'linear-gradient(135deg, #ff990010, transparent)'
                : 'linear-gradient(135deg, #6C5CE710, transparent)',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
              <Download
                size={24}
                style={{
                  color: isInstalled ? '#ff9900' : '#6C5CE7',
                  filter: 'drop-shadow(0 2px 4px rgba(0,0,0,0.2))',
                }}
              />
              <div>
                <h2 style={{ fontSize: '18px', fontWeight: 600, margin: 0 }}>
                  {isInstalled ? 'Update Module' : 'Install Module'}
                </h2>
                <p
                  style={{
                    fontSize: '12px',
                    margin: '4px 0 0 0',
                    color: 'var(--vscode-descriptionForeground)',
                    opacity: 0.8,
                  }}
                >
                  Confirm installation details
                </p>
              </div>
            </div>
            <button
              onClick={onClose}
              style={{
                background: 'transparent',
                border: 'none',
                color: 'var(--vscode-foreground)',
                cursor: 'pointer',
                padding: '4px',
                display: 'flex',
                alignItems: 'center',
                opacity: 0.7,
                transition: 'opacity 0.2s',
              }}
              onMouseEnter={(e) => (e.currentTarget.style.opacity = '1')}
              onMouseLeave={(e) => (e.currentTarget.style.opacity = '0.7')}
            >
              <X size={20} />
            </button>
          </div>

          {/* Body */}
          <div style={{ padding: '24px' }}>
            {/* Module Info */}
            <div
              style={{
                marginBottom: '20px',
                padding: '16px',
                backgroundColor: 'var(--vscode-textCodeBlock-background)',
                borderRadius: '8px',
                border: '1px solid var(--vscode-panel-border)',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'flex-start', gap: '12px' }}>
                <div
                  style={{
                    padding: '12px',
                    backgroundColor: 'var(--vscode-editor-background)',
                    borderRadius: '8px',
                    border: '1px solid var(--vscode-panel-border)',
                  }}
                >
                  <Package size={28} style={{ color: '#6C5CE7' }} />
                </div>
                <div style={{ flex: 1 }}>
                  <div
                    style={{
                      fontSize: '16px',
                      fontWeight: 600,
                      marginBottom: '4px',
                      color: 'var(--vscode-foreground)',
                    }}
                  >
                    {module.display_name || module.name}
                  </div>
                  <div
                    style={{
                      fontSize: '12px',
                      color: 'var(--vscode-descriptionForeground)',
                      marginBottom: '8px',
                    }}
                  >
                    {module.description}
                  </div>
                  <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                    <span
                      style={{
                        fontSize: '11px',
                        padding: '2px 8px',
                        backgroundColor: 'var(--vscode-badge-background)',
                        color: 'var(--vscode-badge-foreground)',
                        borderRadius: '4px',
                        fontWeight: 500,
                      }}
                    >
                      v{module.version}
                    </span>
                    <span
                      style={{
                        fontSize: '11px',
                        padding: '2px 8px',
                        backgroundColor: 'var(--vscode-editor-background)',
                        border: '1px solid var(--vscode-panel-border)',
                        borderRadius: '4px',
                        fontWeight: 500,
                      }}
                    >
                      {module.category}
                    </span>
                    {module.status && module.status !== 'stable' && (
                      <span
                        style={{
                          fontSize: '11px',
                          padding: '2px 8px',
                          backgroundColor: '#ff990020',
                          color: '#ff9900',
                          borderRadius: '4px',
                          fontWeight: 500,
                        }}
                      >
                        {module.status}
                      </span>
                    )}
                  </div>
                </div>
              </div>
            </div>

            {/* Installation Target */}
            <div
              style={{
                marginBottom: '20px',
                padding: '16px',
                backgroundColor: 'var(--vscode-textCodeBlock-background)',
                borderRadius: '8px',
                border: '1px solid var(--vscode-panel-border)',
              }}
            >
              <div
                style={{
                  fontSize: '12px',
                  fontWeight: 600,
                  marginBottom: '8px',
                  color: 'var(--vscode-foreground)',
                  textTransform: 'uppercase',
                  letterSpacing: '0.5px',
                }}
              >
                Installation Target
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                <Folder size={18} style={{ color: '#6C5CE7', flexShrink: 0 }} />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div
                    style={{
                      fontSize: '14px',
                      fontWeight: 500,
                      marginBottom: '2px',
                      color: 'var(--vscode-foreground)',
                    }}
                  >
                    {workspaceStatus.workspaceName || 'Project'}
                  </div>
                  <div
                    style={{
                      fontSize: '11px',
                      color: 'var(--vscode-descriptionForeground)',
                      fontFamily: 'var(--vscode-editor-font-family)',
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                      whiteSpace: 'nowrap',
                    }}
                  >
                    {workspaceStatus.workspacePath || ''}
                  </div>
                </div>
              </div>
            </div>

            {/* Dependencies Warning */}
            {module.dependencies && module.dependencies.length > 0 && (
              <div
                style={{
                  marginBottom: '20px',
                  padding: '12px 16px',
                  backgroundColor: 'rgba(255, 193, 7, 0.1)',
                  borderLeft: '3px solid #ffc107',
                  borderRadius: '4px',
                  display: 'flex',
                  alignItems: 'flex-start',
                  gap: '10px',
                }}
              >
                <AlertCircle
                  size={18}
                  style={{ color: '#ffc107', flexShrink: 0, marginTop: '1px' }}
                />
                <div style={{ fontSize: '12px', color: 'var(--vscode-foreground)' }}>
                  <strong>Dependencies Required:</strong>
                  <div style={{ marginTop: '6px', display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
                    {module.dependencies.map((dep, index) => (
                      <span
                        key={index}
                        style={{
                          fontSize: '11px',
                          padding: '3px 8px',
                          backgroundColor: 'rgba(255, 193, 7, 0.15)',
                          border: '1px solid rgba(255, 193, 7, 0.3)',
                          borderRadius: '4px',
                          fontFamily: 'var(--vscode-editor-font-family)',
                        }}
                      >
                        {dep}
                      </span>
                    ))}
                  </div>
                </div>
              </div>
            )}

            {/* Status Info */}
            {isInstalled && (
              <div
                style={{
                  marginBottom: '20px',
                  padding: '12px 16px',
                  backgroundColor: 'rgba(255, 153, 0, 0.1)',
                  borderLeft: '3px solid #ff9900',
                  borderRadius: '4px',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '10px',
                }}
              >
                <AlertCircle size={18} style={{ color: '#ff9900', flexShrink: 0 }} />
                <div style={{ fontSize: '12px', color: 'var(--vscode-foreground)' }}>
                  Currently installed: <strong>v{installedVersion}</strong>
                  {module.version && installedVersion && module.version !== installedVersion && (
                    <span>
                      {' '}
                      → Will update to <strong>v{module.version}</strong>
                    </span>
                  )}
                </div>
              </div>
            )}

            {/* Command Preview */}
            <div
              style={{
                padding: '12px',
                backgroundColor: 'var(--vscode-terminal-background)',
                border: '1px solid var(--vscode-panel-border)',
                borderRadius: '6px',
                fontSize: '12px',
                fontFamily: 'var(--vscode-editor-font-family)',
                color: '#4ec9b0',
                lineHeight: '1.5',
              }}
            >
              <div style={{ marginBottom: '4px', color: 'var(--vscode-descriptionForeground)' }}>
                Command:
              </div>
              <code>rapidkit add module {module.slug || module.id}</code>
            </div>
          </div>

          {/* Footer */}
          <div
            style={{
              display: 'flex',
              justifyContent: 'flex-end',
              gap: '12px',
              padding: '16px 24px',
              borderTop: '1px solid var(--vscode-panel-border)',
            }}
          >
            <button
              onClick={onClose}
              style={{
                padding: '8px 16px',
                fontSize: '13px',
                fontWeight: 500,
                borderRadius: '6px',
                border: '1px solid var(--vscode-button-border)',
                backgroundColor: 'var(--vscode-button-secondaryBackground)',
                color: 'var(--vscode-button-secondaryForeground)',
                cursor: 'pointer',
                transition: 'all 0.2s',
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.backgroundColor =
                  'var(--vscode-button-secondaryHoverBackground)';
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.backgroundColor = 'var(--vscode-button-secondaryBackground)';
              }}
            >
              Cancel
            </button>
            <button
              onClick={onConfirm}
              style={{
                padding: '8px 20px',
                fontSize: '13px',
                fontWeight: 600,
                borderRadius: '6px',
                border: 'none',
                backgroundColor: isInstalled ? '#ff9900' : '#6C5CE7',
                color: 'white',
                cursor: 'pointer',
                transition: 'all 0.2s',
                display: 'flex',
                alignItems: 'center',
                gap: '6px',
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.transform = 'translateY(-1px)';
                e.currentTarget.style.boxShadow = `0 4px 12px ${isInstalled ? '#ff990040' : '#6C5CE740'}`;
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.transform = 'translateY(0)';
                e.currentTarget.style.boxShadow = 'none';
              }}
            >
              <Download size={16} />
              {isInstalled ? 'Update Module' : 'Install Module'}
            </button>
          </div>
        </div>
      </div>

      {/* CSS animations */}
      <style>
        {`
                    @keyframes fadeIn {
                        from { opacity: 0; }
                        to { opacity: 1; }
                    }
                    @keyframes slideUp {
                        from { 
                            opacity: 0;
                            transform: translate(-50%, -45%);
                        }
                        to { 
                            opacity: 1;
                            transform: translate(-50%, -50%);
                        }
                    }
                `}
      </style>
    </>
  );
}
