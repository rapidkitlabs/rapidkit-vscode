import type {
  RepositoryAnalysisReport,
  RepositoryAnalysisStage,
} from '@workspai-contracts/repositoryAnalysis';
import {
  bytesToDataUrl,
  encodeWorkspaceGraphGif,
  type WorkspaceGraphGifFrame,
} from './workspaceGraphGif';

export type RepositoryAnalysisStoryStep = {
  stage: RepositoryAnalysisStage;
  message: string;
};

const WIDTH = 960;
const HEIGHT = 540;
const STAGES: RepositoryAnalysisStage[] = [
  'validating',
  'cloning',
  'adopting',
  'modeling',
  'verifying',
  'measuring',
  'ready',
];

function compact(value: number): string {
  return new Intl.NumberFormat('en', { notation: 'compact', maximumFractionDigits: 1 }).format(
    value
  );
}

function hash(value: string): number {
  let result = 2166136261;
  for (const character of value) {
    result ^= character.charCodeAt(0);
    result = Math.imul(result, 16777619);
  }
  return result >>> 0;
}

function drawGraphPreview(
  context: CanvasRenderingContext2D,
  report: RepositoryAnalysisReport,
  capturedGraph?: ImageData,
  bounds = { x: 555, y: 174, width: 350, height: 250 }
) {
  if (capturedGraph) {
    const source = document.createElement('canvas');
    source.width = capturedGraph.width;
    source.height = capturedGraph.height;
    source.getContext('2d')?.putImageData(capturedGraph, 0, 0);
    context.drawImage(source, bounds.x, bounds.y, bounds.width, bounds.height);
    return;
  }
  const entities = report.graph.entities.slice(0, 90);
  const ids = new Set(entities.map((entity) => entity.id));
  const points = new Map<string, { x: number; y: number }>();
  for (const entity of entities) {
    const value = hash(entity.id);
    const angle = ((value % 3600) / 3600) * Math.PI * 2;
    const radius = 36 + ((value >>> 8) % 130);
    points.set(entity.id, {
      x: bounds.x + bounds.width / 2 + Math.cos(angle) * Math.min(radius, bounds.width * 0.38),
      y:
        bounds.y +
        bounds.height / 2 +
        Math.sin(angle) * Math.min(radius * 0.68, bounds.height * 0.38),
    });
  }
  context.lineWidth = 0.7;
  context.strokeStyle = 'rgba(55, 214, 197, 0.2)';
  for (const relation of report.graph.relations.slice(0, 180)) {
    if (!ids.has(relation.from) || !ids.has(relation.to)) {
      continue;
    }
    const from = points.get(relation.from);
    const to = points.get(relation.to);
    if (!from || !to) {
      continue;
    }
    context.beginPath();
    context.moveTo(from.x, from.y);
    context.lineTo(to.x, to.y);
    context.stroke();
  }
  for (const entity of entities) {
    const point = points.get(entity.id);
    if (!point) {
      continue;
    }
    context.fillStyle = entity.kind === 'project' ? '#f8c35c' : '#37d6c5';
    context.globalAlpha = entity.kind === 'file' ? 0.48 : 0.86;
    context.beginPath();
    context.arc(point.x, point.y, entity.kind === 'project' ? 3.4 : 1.8, 0, Math.PI * 2);
    context.fill();
  }
  context.globalAlpha = 1;
}

function drawFrame(
  context: CanvasRenderingContext2D,
  report: RepositoryAnalysisReport,
  activeStage: RepositoryAnalysisStage,
  message: string,
  final: boolean,
  capturedGraph?: ImageData
): WorkspaceGraphGifFrame {
  const gradient = context.createLinearGradient(0, 0, WIDTH, HEIGHT);
  gradient.addColorStop(0, '#071419');
  gradient.addColorStop(0.54, '#0a1016');
  gradient.addColorStop(1, '#111018');
  context.fillStyle = gradient;
  context.fillRect(0, 0, WIDTH, HEIGHT);

  const glow = context.createRadialGradient(720, 270, 0, 720, 270, 320);
  glow.addColorStop(0, 'rgba(55, 214, 197, 0.13)');
  glow.addColorStop(1, 'rgba(55, 214, 197, 0)');
  context.fillStyle = glow;
  context.fillRect(400, 0, 560, 540);

  context.fillStyle = '#37d6c5';
  context.font = '700 13px ui-monospace, monospace';
  context.fillText('WORKSPAI · LOCAL REPOSITORY INTELLIGENCE', 48, 48);
  context.fillStyle = '#f3f7f7';
  context.font = '700 30px system-ui, sans-serif';
  context.fillText(`${report.repository.owner}/${report.repository.name}`, 48, 92);
  context.fillStyle = '#7f9298';
  context.font = '12px ui-monospace, monospace';
  context.fillText(
    `commit ${report.repository.commit.slice(0, 12)} · CLI ${report.execution.cliVersion}`,
    48,
    116
  );

  const activeIndex = STAGES.indexOf(activeStage);
  STAGES.forEach((stage, index) => {
    const y = 166 + index * 43;
    const complete = index <= activeIndex;
    context.strokeStyle = complete ? '#37d6c5' : '#27353b';
    context.fillStyle = complete ? '#37d6c5' : '#27353b';
    context.lineWidth = 2;
    if (index < STAGES.length - 1) {
      context.beginPath();
      context.moveTo(57, y + 8);
      context.lineTo(57, y + 43);
      context.stroke();
    }
    context.beginPath();
    context.arc(57, y, complete ? 6 : 4, 0, Math.PI * 2);
    context.fill();
    context.fillStyle = complete ? '#dce9e8' : '#66767c';
    context.font = `${stage === activeStage ? '700' : '500'} 12px ui-monospace, monospace`;
    context.fillText(stage.toUpperCase(), 78, y + 4);
  });

  context.fillStyle = '#9fb0b4';
  context.font = '14px system-ui, sans-serif';
  context.fillText(message, 410, 150);

  if (final) {
    drawGraphPreview(context, report, capturedGraph);
    const metrics = [
      [compact(report.summary.entities), 'ENTITIES'],
      [compact(report.summary.relations), 'RELATIONS'],
      [compact(report.summary.proofs), 'PROOFS'],
    ];
    metrics.forEach(([value, label], index) => {
      const x = 410 + index * 150;
      context.fillStyle = '#f3f7f7';
      context.font = '700 25px system-ui, sans-serif';
      context.fillText(value, x, 448);
      context.fillStyle = '#70838a';
      context.font = '10px ui-monospace, monospace';
      context.fillText(label, x, 468);
    });
    context.fillStyle = report.doctor.verdict === 'passed' ? '#37d6c5' : '#f8c35c';
    context.font = '700 12px ui-monospace, monospace';
    context.fillText(
      `DOCTOR ${report.doctor.verdict.toUpperCase()} · ${report.doctor.counts.blockingCauses} BLOCKERS`,
      410,
      505
    );
  } else {
    context.strokeStyle = 'rgba(55, 214, 197, 0.18)';
    context.lineWidth = 1;
    for (let ring = 0; ring < 4; ring += 1) {
      context.beginPath();
      context.ellipse(710, 302, 74 + ring * 38, 34 + ring * 22, -0.14, 0, Math.PI * 2);
      context.stroke();
    }
    const progress = (activeIndex + 1) / STAGES.length;
    context.fillStyle = '#37d6c5';
    context.font = '700 58px system-ui, sans-serif';
    context.fillText(`${Math.round(progress * 100)}%`, 640, 325);
  }

  return {
    width: WIDTH,
    height: HEIGHT,
    data: context.getImageData(0, 0, WIDTH, HEIGHT).data,
  };
}

function drawTourFrame(
  context: CanvasRenderingContext2D,
  report: RepositoryAnalysisReport,
  view: 'graph' | 'doctor' | 'agent' | 'final',
  capturedGraph?: ImageData,
  zoom = 1
): WorkspaceGraphGifFrame {
  const gradient = context.createLinearGradient(0, 0, WIDTH, HEIGHT);
  gradient.addColorStop(0, '#061317');
  gradient.addColorStop(1, '#10131a');
  context.fillStyle = gradient;
  context.fillRect(0, 0, WIDTH, HEIGHT);
  context.save();
  context.translate(WIDTH / 2, HEIGHT / 2);
  context.scale(zoom, zoom);
  context.translate(-WIDTH / 2, -HEIGHT / 2);
  context.fillStyle = '#37d6c5';
  context.font = '700 12px ui-monospace, monospace';
  context.fillText('WORKSPAI · EVIDENCE TOUR', 42, 39);
  context.fillStyle = '#f3f7f7';
  context.font = '700 26px system-ui, sans-serif';
  context.fillText(`${report.repository.owner}/${report.repository.name}`, 42, 74);
  context.strokeStyle = '#253138';
  context.strokeRect(40, 96, 880, 398);

  if (view === 'graph') {
    context.fillStyle = '#37d6c5';
    context.font = '700 11px ui-monospace, monospace';
    context.fillText('CANONICAL 3D GRAPH', 60, 126);
    drawGraphPreview(context, report, capturedGraph, { x: 60, y: 145, width: 840, height: 300 });
    context.fillStyle = '#9eb0b5';
    context.font = '11px ui-monospace, monospace';
    context.fillText(
      `${compact(report.graph.total.entities)} nodes · ${compact(report.graph.total.relations)} relations · ${report.graph.providers.length} providers`,
      60,
      470
    );
  } else if (view === 'doctor') {
    const findings = report.doctor.findings.slice(0, 4);
    context.fillStyle = report.doctor.verdict === 'passed' ? '#37d6c5' : '#f8c35c';
    context.font = '700 11px ui-monospace, monospace';
    context.fillText(`DOCTOR · ${report.doctor.verdict.toUpperCase()}`, 60, 130);
    context.fillStyle = '#f3f7f7';
    context.font = '700 52px system-ui, sans-serif';
    context.fillText(String(report.doctor.counts.blockingCauses), 60, 210);
    context.fillStyle = '#91a4aa';
    context.font = '13px system-ui, sans-serif';
    context.fillText('blocking causes', 60, 236);
    findings.forEach((finding, index) => {
      const y = 150 + index * 70;
      context.fillStyle = finding.status === 'blocking' ? '#ff6974' : '#f8c35c';
      context.fillRect(280, y, 4, 45);
      context.fillStyle = '#e8eeee';
      context.font = '700 13px system-ui, sans-serif';
      context.fillText(finding.projectName ?? finding.id, 302, y + 16);
      context.fillStyle = '#84969c';
      context.font = '11px system-ui, sans-serif';
      context.fillText(finding.symptom.slice(0, 78), 302, y + 36);
    });
  } else if (view === 'agent') {
    const cards = [
      ['WEB AGENT FIT', report.insights.webAgent.verdict],
      ['SECURITY SIGNALS', report.insights.security.verdict],
      ['DELIVERY PATH', report.insights.delivery.verdict],
      ['CHANGE SURFACE', report.insights.changeSurface.verdict],
    ];
    cards.forEach(([label, value], index) => {
      const x = 60 + (index % 2) * 425;
      const y = 132 + Math.floor(index / 2) * 155;
      context.fillStyle = '#121b20';
      context.fillRect(x, y, 395, 125);
      context.strokeStyle = '#27363c';
      context.strokeRect(x, y, 395, 125);
      context.fillStyle = '#37d6c5';
      context.font = '700 10px ui-monospace, monospace';
      context.fillText(label, x + 20, y + 28);
      context.fillStyle = '#f3f7f7';
      context.font = '700 24px system-ui, sans-serif';
      context.fillText(value.replace(/-/g, ' '), x + 20, y + 66);
    });
  } else {
    context.fillStyle = '#37d6c5';
    context.font = '700 12px ui-monospace, monospace';
    context.fillText('QUESTION-SIZED CONTEXT. BEFORE THE FIRST CHANGE.', 60, 135);
    context.fillStyle = '#f3f7f7';
    context.font = '700 42px system-ui, sans-serif';
    context.fillText(
      `${report.insights.webAgent.verdict.toUpperCase()} FOR AGENT HANDOFF`,
      60,
      206
    );
    context.fillStyle = '#9aabb0';
    context.font = '15px system-ui, sans-serif';
    context.fillText(
      `${compact(report.summary.entities)} entities mapped into proof-backed, bounded evidence.`,
      60,
      248
    );
    report.questions.slice(0, 3).forEach((question, index) => {
      context.fillStyle = '#142126';
      context.fillRect(60, 286 + index * 52, 820, 38);
      context.fillStyle = '#c8d5d6';
      context.font = '12px system-ui, sans-serif';
      context.fillText(question, 78, 310 + index * 52);
    });
  }

  context.restore();
  return {
    width: WIDTH,
    height: HEIGHT,
    data: context.getImageData(0, 0, WIDTH, HEIGHT).data,
  };
}

export function createRepositoryAnalysisStoryGif(
  report: RepositoryAnalysisReport,
  story: RepositoryAnalysisStoryStep[],
  options: { capturedGraph?: ImageData } = {}
): { gifDataUrl: string; width: number; height: number; frameCount: number } {
  const canvas = document.createElement('canvas');
  canvas.width = WIDTH;
  canvas.height = HEIGHT;
  const context = canvas.getContext('2d', { alpha: false });
  if (!context) {
    throw new Error('Canvas export is unavailable in this Webview.');
  }
  const observedStory = story.length
    ? story
    : [
        {
          stage: 'ready' as const,
          message: report.execution.cacheReused
            ? 'Current evidence restored from the local cache'
            : 'Evidence-backed analysis ready',
        },
      ];
  const frames = observedStory.map((step) =>
    drawFrame(
      context,
      report,
      step.stage,
      step.message,
      step.stage === 'ready',
      options.capturedGraph
    )
  );
  frames.push(drawTourFrame(context, report, 'graph', options.capturedGraph, 0.96));
  frames.push(drawTourFrame(context, report, 'graph', options.capturedGraph, 1));
  frames.push(drawTourFrame(context, report, 'doctor', options.capturedGraph, 0.96));
  frames.push(drawTourFrame(context, report, 'doctor', options.capturedGraph, 1));
  frames.push(drawTourFrame(context, report, 'agent', options.capturedGraph, 0.96));
  frames.push(drawTourFrame(context, report, 'agent', options.capturedGraph, 1));
  frames.push(drawTourFrame(context, report, 'final', options.capturedGraph, 0.96));
  frames.push(drawTourFrame(context, report, 'final', options.capturedGraph, 1));
  return {
    gifDataUrl: bytesToDataUrl(
      encodeWorkspaceGraphGif(frames, { delayCentiseconds: 64, repeat: 0 }),
      'image/gif'
    ),
    width: WIDTH,
    height: HEIGHT,
    frameCount: frames.length,
  };
}
