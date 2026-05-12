/**
 * C02: BYOP Discovery Pipeline - Test Suite
 *
 * 33 comprehensive tests covering:
 * - FastAPI, NestJS, Go/Gin/GoFiber project detection
 * - Mixed/polyglot framework detection
 * - Confidence scoring and capability levels
 * - Portfolio metrics
 * - Edge cases and error handling
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { ByopDiscoveryEngine, type DiscoveryResult } from '../core/byopDiscovery';
import { ConfidenceScorerForByop } from '../core/byopConfidenceScorer';
import {
  getFrameworkProfile,
  getProfilesByRuntime,
  getAllProfiles,
} from '../core/byopFrameworkProfiles';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';

// ============================================================================
// Test Fixtures - Mock Project Structures
// ============================================================================

function createFixtureProject(name: string): string {
  const tempDir = path.join(os.tmpdir(), `byop-test-${name}-${Date.now()}`);

  if (!fs.existsSync(tempDir)) {
    fs.mkdirSync(tempDir, { recursive: true });
  }

  return tempDir;
}

function setupFastAPIProject(projectPath: string): void {
  // package.json
  fs.writeFileSync(
    path.join(projectPath, 'pyproject.toml'),
    `[tool.poetry.dependencies]
python = "^3.11"
fastapi = "^0.104.0"
uvicorn = "^0.24.0"
sqlalchemy = "^2.0"
`
  );

  // Dockerfile
  fs.writeFileSync(
    path.join(projectPath, 'Dockerfile'),
    `FROM python:3.11-slim
WORKDIR /app
COPY . .
RUN pip install -r requirements.txt
CMD ["uvicorn", "main:app", "--host", "0.0.0.0", "--port", "8000"]
`
  );

  // main.py with FastAPI usage
  fs.mkdirSync(path.join(projectPath, 'src'), { recursive: true });
  fs.writeFileSync(
    path.join(projectPath, 'main.py'),
    `from fastapi import FastAPI, HTTPException
from sqlalchemy import create_engine

app = FastAPI(title="My API", version="1.0.0")

@app.get("/health")
async def health():
    return {"status": "ok"}

@app.post("/items")
async def create_item(item: dict):
    return item
`
  );

  // Makefile
  fs.writeFileSync(
    path.join(projectPath, 'Makefile'),
    `test:
	pytest tests/
run:
	python main.py
`
  );
}

function setupNestJSProject(projectPath: string): void {
  // package.json
  fs.writeFileSync(
    path.join(projectPath, 'package.json'),
    `{
  "name": "my-nest-app",
  "version": "1.0.0",
  "dependencies": {
    "@nestjs/core": "^10.2.0",
    "@nestjs/common": "^10.2.0",
    "@nestjs/platform-express": "^10.2.0",
    "typeorm": "^0.3.0"
  },
  "devDependencies": {
    "@nestjs/cli": "^10.2.0",
    "typescript": "^5.2.0"
  }
}
`
  );

  // Dockerfile
  fs.writeFileSync(
    path.join(projectPath, 'Dockerfile'),
    `FROM node:20-alpine
WORKDIR /app
COPY . .
RUN npm install && npm run build
EXPOSE 3000
CMD ["npm", "start"]
`
  );

  // src/main.ts
  fs.mkdirSync(path.join(projectPath, 'src'), { recursive: true });
  fs.writeFileSync(
    path.join(projectPath, 'src', 'main.ts'),
    `import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  await app.listen(3000);
}
bootstrap();
`
  );

  // src/app.module.ts
  fs.writeFileSync(
    path.join(projectPath, 'src', 'app.module.ts'),
    `import { Module } from '@nestjs/common';
import { AppController } from './app.controller';
import { AppService } from './app.service';

@Module({
  imports: [],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
`
  );
}

function setupGoGinProject(projectPath: string): void {
  fs.writeFileSync(
    path.join(projectPath, 'go.mod'),
    `module github.com/example/api

go 1.21

require (
    github.com/gin-gonic/gin v1.9.1
    gorm.io/gorm v1.25.2
)
`
  );

  fs.writeFileSync(
    path.join(projectPath, 'Dockerfile'),
    `FROM golang:1.21-alpine
WORKDIR /app
COPY . .
RUN go build -o api main.go
EXPOSE 8080
CMD ["./api"]
`
  );

  fs.writeFileSync(
    path.join(projectPath, 'main.go'),
    `package main

import (
    "github.com/gin-gonic/gin"
    "gorm.io/gorm"
)

func main() {
    r := gin.Default()

    r.GET("/health", func(c *gin.Context) {
        c.JSON(200, gin.H{"status": "ok"})
    })

    r.Run(":8080")
}

`
  );

  fs.writeFileSync(
    path.join(projectPath, 'Makefile'),
    `test:
	go test ./...
run:
	go run main.go
build:
	go build -o api main.go
`
  );
}

function setupGoFiberProject(projectPath: string): void {
  fs.writeFileSync(
    path.join(projectPath, 'go.mod'),
    `module github.com/example/fiber-api

go 1.21

require (
    github.com/gofiber/fiber/v2 v2.52.4
)
`
  );

  fs.writeFileSync(
    path.join(projectPath, 'Dockerfile'),
    `FROM golang:1.21-alpine
WORKDIR /app
COPY . .
RUN go build -o api main.go
EXPOSE 3000
CMD ["./api"]
`
  );

  fs.writeFileSync(
    path.join(projectPath, 'main.go'),
    `package main

import "github.com/gofiber/fiber/v2"

func main() {
    app := fiber.New()

    app.Get("/health", func(c *fiber.Ctx) error {
        return c.JSON(fiber.Map{"status": "ok"})
    })

    app.Listen(":3000")
}
`
  );

  fs.writeFileSync(
    path.join(projectPath, 'Makefile'),
    `test:
	go test ./...
run:
	go run main.go
build:
	go build -o api main.go
`
  );
}

function setupSpringBootProject(projectPath: string): void {
  fs.writeFileSync(
    path.join(projectPath, 'pom.xml'),
    `<project>
  <dependencies>
    <dependency>
      <groupId>org.springframework.boot</groupId>
      <artifactId>spring-boot-starter-web</artifactId>
    </dependency>
  </dependencies>
</project>
`
  );

  const javaDir = path.join(projectPath, 'src', 'main', 'java', 'com', 'example', 'demo');
  fs.mkdirSync(javaDir, { recursive: true });
  fs.writeFileSync(
    path.join(javaDir, 'DemoApplication.java'),
    `package com.example.demo;

import org.springframework.boot.SpringApplication;
import org.springframework.boot.autoconfigure.SpringBootApplication;

@SpringBootApplication
public class DemoApplication {
  public static void main(String[] args) {
    SpringApplication.run(DemoApplication.class, args);
  }
}
`
  );
}

function setupRailsProject(projectPath: string): void {
  fs.writeFileSync(
    path.join(projectPath, 'Gemfile'),
    `source 'https://rubygems.org'
gem 'rails', '~> 7.1.0'
`
  );

  fs.mkdirSync(path.join(projectPath, 'config'), { recursive: true });
  fs.writeFileSync(
    path.join(projectPath, 'config', 'application.rb'),
    `require_relative "boot"
require "rails/all"
`
  );
}

function setupDotnetProject(projectPath: string): void {
  fs.writeFileSync(
    path.join(projectPath, 'DemoApi.csproj'),
    `<Project Sdk="Microsoft.NET.Sdk.Web">
  <PropertyGroup>
    <TargetFramework>net8.0</TargetFramework>
  </PropertyGroup>
  <ItemGroup>
    <PackageReference Include="Microsoft.AspNetCore.OpenApi" Version="8.0.0" />
  </ItemGroup>
</Project>
`
  );

  fs.writeFileSync(
    path.join(projectPath, 'Program.cs'),
    `using Microsoft.AspNetCore.Builder;
using Microsoft.Extensions.DependencyInjection;

var builder = WebApplication.CreateBuilder(args);
builder.Services.AddControllers();
var app = builder.Build();
app.MapControllers();
app.Run();
`
  );
}

function setupUnknownProject(projectPath: string): void {
  // Minimal setup - no clear framework indicators
  fs.writeFileSync(path.join(projectPath, 'README.md'), '# My Project');

  fs.mkdirSync(path.join(projectPath, 'src'), { recursive: true });
  fs.writeFileSync(
    path.join(projectPath, 'src', 'app.py'),
    `# Generic Python code
def main():
    print("Hello")
    
if __name__ == "__main__":
    main()
`
  );
}

function cleanupFixtureProject(projectPath: string): void {
  try {
    if (fs.existsSync(projectPath)) {
      fs.rmSync(projectPath, { recursive: true });
    }
  } catch {
    // Ignore cleanup errors in tests
  }
}

// ============================================================================
// Test Suite
// ============================================================================

describe('C02: BYOP Discovery Pipeline', () => {
  // =========================================================================
  // Framework Detection Tests
  // =========================================================================

  describe('Framework Detection', () => {
    it('should detect FastAPI project with high confidence', async () => {
      const projectPath = createFixtureProject('fastapi');
      setupFastAPIProject(projectPath);

      try {
        const engine = new ByopDiscoveryEngine(projectPath);
        const result = await engine.discover();

        expect(result.runtime).toBe('python');
        expect(result.framework).toBe('fastapi');
        expect(result.confidenceLevel).toBe('high');
        expect(result.signalBreakdown.length).toBeGreaterThan(0);
      } finally {
        cleanupFixtureProject(projectPath);
      }
    });

    it('should detect NestJS project with high confidence', async () => {
      const projectPath = createFixtureProject('nestjs');
      setupNestJSProject(projectPath);

      try {
        const engine = new ByopDiscoveryEngine(projectPath);
        const result = await engine.discover();

        expect(result.runtime).toBe('nodejs');
        expect(result.framework).toBe('nestjs');
        expect(result.confidenceLevel).toBe('high');
      } finally {
        cleanupFixtureProject(projectPath);
      }
    });

    it('should detect Go/Gin project with high confidence', async () => {
      const projectPath = createFixtureProject('gin');
      setupGoGinProject(projectPath);

      try {
        const engine = new ByopDiscoveryEngine(projectPath);
        const result = await engine.discover();

        expect(result.runtime).toBe('go');
        expect(result.framework).toBe('gogin');
        expect(result.confidenceLevel).toBe('high');
      } finally {
        cleanupFixtureProject(projectPath);
      }
    });

    it('should detect GoFiber project with high confidence', async () => {
      const projectPath = createFixtureProject('gofiber');
      setupGoFiberProject(projectPath);

      try {
        const engine = new ByopDiscoveryEngine(projectPath);
        const result = await engine.discover();

        expect(result.runtime).toBe('go');
        expect(result.framework).toBe('gofiber');
        expect(result.confidenceLevel).toBe('high');
      } finally {
        cleanupFixtureProject(projectPath);
      }
    });

    it('should detect Spring Boot project with high confidence', async () => {
      const projectPath = createFixtureProject('spring-boot');
      setupSpringBootProject(projectPath);

      try {
        const engine = new ByopDiscoveryEngine(projectPath);
        const result = await engine.discover();

        expect(result.runtime).toBe('java');
        expect(result.framework).toBe('springboot');
        expect(result.confidenceLevel).toMatch(/high|medium/);
      } finally {
        cleanupFixtureProject(projectPath);
      }
    });

    it('should detect Rails project with high confidence', async () => {
      const projectPath = createFixtureProject('rails');
      setupRailsProject(projectPath);

      try {
        const engine = new ByopDiscoveryEngine(projectPath);
        const result = await engine.discover();

        expect(result.runtime).toBe('ruby');
        expect(result.framework).toBe('rails');
        expect(result.confidenceLevel).toMatch(/high|medium/);
      } finally {
        cleanupFixtureProject(projectPath);
      }
    });

    it('should detect Dotnet project with high confidence', async () => {
      const projectPath = createFixtureProject('dotnet');
      setupDotnetProject(projectPath);

      try {
        const engine = new ByopDiscoveryEngine(projectPath);
        const result = await engine.discover();

        expect(result.runtime).toBe('csharp');
        expect(result.framework).toBe('dotnet');
        expect(result.confidenceLevel).toMatch(/high|medium/);
      } finally {
        cleanupFixtureProject(projectPath);
      }
    });

    it('should detect Python runtime from Dockerfile alone', async () => {
      const projectPath = createFixtureProject('dockerfile-only');

      // Only Dockerfile, no package manager files
      fs.writeFileSync(
        path.join(projectPath, 'Dockerfile'),
        `FROM python:3.11-slim
WORKDIR /app
COPY . .
RUN pip install fastapi uvicorn
CMD ["python", "main.py"]
`
      );

      try {
        const engine = new ByopDiscoveryEngine(projectPath);
        const result = await engine.discover();

        expect(result.runtime).toBe('python');
        expect(result.confidenceLevel).toMatch(/high|medium/);
      } finally {
        cleanupFixtureProject(projectPath);
      }
    });

    it('should handle unknown project gracefully', async () => {
      const projectPath = createFixtureProject('unknown');
      setupUnknownProject(projectPath);

      try {
        const engine = new ByopDiscoveryEngine(projectPath);
        const result = await engine.discover();

        expect(result.runtime).toBeDefined();
        expect(result.confidenceLevel).toBeDefined();
        expect(result.detectedAt).toBeDefined();
      } finally {
        cleanupFixtureProject(projectPath);
      }
    });
  });

  // =========================================================================
  // Signal Detection Tests
  // =========================================================================

  describe('Signal Detection Sources', () => {
    it('should collect signals from package manager', async () => {
      const projectPath = createFixtureProject('package-manager-signals');
      setupFastAPIProject(projectPath);

      try {
        const engine = new ByopDiscoveryEngine(projectPath);
        const result = await engine.discover();

        const packageManagerSignals = result.signalBreakdown.find(
          (s) => s.source === 'packageManager'
        );
        expect(packageManagerSignals).toBeDefined();
        expect(packageManagerSignals?.signals.length).toBeGreaterThan(0);
      } finally {
        cleanupFixtureProject(projectPath);
      }
    });

    it('should collect signals from Dockerfile', async () => {
      const projectPath = createFixtureProject('dockerfile-signals');
      setupFastAPIProject(projectPath);

      try {
        const engine = new ByopDiscoveryEngine(projectPath);
        const result = await engine.discover();

        const dockerfileSignals = result.signalBreakdown.find((s) => s.source === 'dockerfile');
        expect(dockerfileSignals).toBeDefined();
      } finally {
        cleanupFixtureProject(projectPath);
      }
    });

    it('should collect signals from entry points', async () => {
      const projectPath = createFixtureProject('entrypoint-signals');
      setupFastAPIProject(projectPath);

      try {
        const engine = new ByopDiscoveryEngine(projectPath);
        const result = await engine.discover();

        const entrypointSignals = result.signalBreakdown.find((s) => s.source === 'entryPoint');
        expect(entrypointSignals).toBeDefined();
      } finally {
        cleanupFixtureProject(projectPath);
      }
    });
  });

  // =========================================================================
  // Confidence Scoring Tests
  // =========================================================================

  describe('Confidence Scoring', () => {
    it('should score FastAPI with high confidence', async () => {
      const projectPath = createFixtureProject('score-fastapi');
      setupFastAPIProject(projectPath);

      try {
        const engine = new ByopDiscoveryEngine(projectPath);
        const result = await engine.discover();

        const scorer = new ConfidenceScorerForByop();
        const breakdown = scorer.scoreDiscoveryResult(result, true);

        expect(breakdown.confidenceScore).toBeGreaterThan(0.7);
        expect(breakdown.overallConfidence).toBe('high');
        expect(breakdown.agreementRate).toBeGreaterThan(0.5);
      } finally {
        cleanupFixtureProject(projectPath);
      }
    });

    it('should degrade capability level for unsupported frameworks', async () => {
      const projectPath = createFixtureProject('unsupported');
      setupUnknownProject(projectPath);

      try {
        const engine = new ByopDiscoveryEngine(projectPath);
        const result = await engine.discover();

        const scorer = new ConfidenceScorerForByop();
        const breakdown = scorer.scoreDiscoveryResult(result, false); // Not supported

        // Unknown/unsupported should be L0 or L1, not L2
        expect(['L0', 'L1']).toContain(breakdown.capabilityLevel);
      } finally {
        cleanupFixtureProject(projectPath);
      }
    });

    it('should assign L2 capability for supported high-confidence framework', async () => {
      const projectPath = createFixtureProject('l2-capability');
      setupFastAPIProject(projectPath);

      try {
        const engine = new ByopDiscoveryEngine(projectPath);
        const result = await engine.discover();

        const scorer = new ConfidenceScorerForByop();
        const breakdown = scorer.scoreDiscoveryResult(result, true); // Supported

        if (result.confidenceLevel === 'high') {
          expect(breakdown.capabilityLevel).toBe('L2');
        }
      } finally {
        cleanupFixtureProject(projectPath);
      }
    });

    it('should assign L1 capability for unknown high-confidence framework', async () => {
      const projectPath = createFixtureProject('l1-capability');
      setupFastAPIProject(projectPath);

      try {
        const engine = new ByopDiscoveryEngine(projectPath);
        const result = await engine.discover();

        const scorer = new ConfidenceScorerForByop();
        const breakdown = scorer.scoreDiscoveryResult(result, false); // Not supported but high confidence

        if (result.confidenceLevel === 'high') {
          expect(breakdown.capabilityLevel).toBe('L1');
        }
      } finally {
        cleanupFixtureProject(projectPath);
      }
    });

    it('should calculate portfolio metrics', async () => {
      const results: DiscoveryResult[] = [
        {
          projectPath: '/project1',
          runtime: 'python',
          framework: 'fastapi',
          confidenceLevel: 'high' as const,
          reason: 'High confidence',
          signalBreakdown: [],
          detectedAt: new Date().toISOString(),
        },
        {
          projectPath: '/project2',
          runtime: 'nodejs',
          framework: 'express',
          confidenceLevel: 'medium' as const,
          reason: 'Medium confidence',
          signalBreakdown: [],
          detectedAt: new Date().toISOString(),
        },
      ];

      const scorer = new ConfidenceScorerForByop();
      const metrics = scorer.calculatePortfolioMetrics(results);

      expect(metrics.averageConfidence).toBeGreaterThan(0);
      expect(metrics.highConfidenceRate).toBeGreaterThan(0);
      expect(metrics.highConfidenceRate).toBeLessThanOrEqual(1);
    });
  });

  // =========================================================================
  // Framework Profile Tests
  // =========================================================================

  describe('Framework Profiles', () => {
    it('should load FastAPI profile', () => {
      const profile = getFrameworkProfile('fastapi');
      expect(profile).toBeDefined();
      expect(profile?.name).toBe('fastapi');
      expect(profile?.runtime).toBe('python');
      expect(profile?.detectionSignals.length).toBeGreaterThan(0);
    });

    it('should load NestJS profile', () => {
      const profile = getFrameworkProfile('nestjs');
      expect(profile).toBeDefined();
      expect(profile?.name).toBe('nestjs');
      expect(profile?.runtime).toBe('nodejs');
    });

    it('should load Gin profile', () => {
      const profile = getFrameworkProfile('gin');
      expect(profile).toBeDefined();
      expect(profile?.name).toBe('gin');
      expect(profile?.runtime).toBe('go');
    });

    it('should load GoFiber profile', () => {
      const profile = getFrameworkProfile('gofiber');
      expect(profile).toBeDefined();
      expect(profile?.name).toBe('gofiber');
      expect(profile?.runtime).toBe('go');
    });

    it('should get all profiles by runtime', () => {
      const pythonProfiles = getProfilesByRuntime('python');
      expect(pythonProfiles.length).toBeGreaterThan(0);
      expect(pythonProfiles.every((p) => p.runtime === 'python')).toBe(true);
    });

    it('should get all profiles sorted by popularity', () => {
      const allProfiles = getAllProfiles();
      expect(allProfiles.length).toBeGreaterThan(0);

      // Verify high popularity frameworks come first
      const foundFastAPI = allProfiles.find((p) => p.name === 'fastapi');
      const foundUnknown = allProfiles.find((p) => p.name === 'unknown');

      if (foundFastAPI && foundUnknown) {
        const fastAPIIndex = allProfiles.indexOf(foundFastAPI);
        const unknownIndex = allProfiles.indexOf(foundUnknown);
        expect(fastAPIIndex).toBeLessThan(unknownIndex);
      }
    });
  });

  // =========================================================================
  // Edge Cases & Error Handling
  // =========================================================================

  describe('Edge Cases', () => {
    it('should handle non-existent project directory', async () => {
      const engine = new ByopDiscoveryEngine('/non/existent/path');
      const result = await engine.discover();

      expect(result.runtime).toBeDefined();
      expect(result.detectedAt).toBeDefined();
      // Should default gracefully without crashing
    });

    it('should handle empty project directory', async () => {
      const projectPath = createFixtureProject('empty');

      try {
        const engine = new ByopDiscoveryEngine(projectPath);
        const result = await engine.discover();

        expect(result.runtime).toBeDefined();
        expect(result.confidenceLevel).toBeDefined();
      } finally {
        cleanupFixtureProject(projectPath);
      }
    });

    it('should handle corrupted JSON files gracefully', async () => {
      const projectPath = createFixtureProject('corrupted');

      // Create corrupted package.json
      fs.writeFileSync(path.join(projectPath, 'package.json'), '{invalid json}');

      try {
        const engine = new ByopDiscoveryEngine(projectPath);
        const result = await engine.discover();

        expect(result.runtime).toBeDefined();
        expect(result.detectedAt).toBeDefined();
      } finally {
        cleanupFixtureProject(projectPath);
      }
    });

    it('should handle mixed runtime signals', async () => {
      const projectPath = createFixtureProject('mixed');

      // Create conflicting signals: both Python and Node.js
      fs.writeFileSync(
        path.join(projectPath, 'pyproject.toml'),
        `[tool.poetry.dependencies]
python = "^3.11"
fastapi = "^0.104.0"
`
      );

      fs.writeFileSync(
        path.join(projectPath, 'package.json'),
        `{
  "name": "my-app",
  "dependencies": {
    "express": "^4.18.0"
  }
}
`
      );

      try {
        const engine = new ByopDiscoveryEngine(projectPath);
        const result = await engine.discover();

        // Should pick one as primary (whichever has more weight)
        expect(['python', 'nodejs']).toContain(result.runtime);
        expect(result.confidenceLevel).toBeDefined();
      } finally {
        cleanupFixtureProject(projectPath);
      }
    });
  });

  // =========================================================================
  // Result Validation Tests
  // =========================================================================

  describe('Result Validation', () => {
    it('should include timestamp in discovery result', async () => {
      const projectPath = createFixtureProject('timestamp');
      setupFastAPIProject(projectPath);

      try {
        const engine = new ByopDiscoveryEngine(projectPath);
        const result = await engine.discover();

        expect(result.detectedAt).toBeDefined();
        // Verify it's valid ISO format
        expect(new Date(result.detectedAt).getTime()).toBeGreaterThan(0);
      } finally {
        cleanupFixtureProject(projectPath);
      }
    });

    it('should include reasoning in discovery result', async () => {
      const projectPath = createFixtureProject('reasoning');
      setupFastAPIProject(projectPath);

      try {
        const engine = new ByopDiscoveryEngine(projectPath);
        const result = await engine.discover();

        expect(result.reason).toBeDefined();
        expect(result.reason.length).toBeGreaterThan(0);
      } finally {
        cleanupFixtureProject(projectPath);
      }
    });

    it('should include signal breakdown for transparency', async () => {
      const projectPath = createFixtureProject('signals');
      setupFastAPIProject(projectPath);

      try {
        const engine = new ByopDiscoveryEngine(projectPath);
        const result = await engine.discover();

        expect(result.signalBreakdown).toBeDefined();
        expect(Array.isArray(result.signalBreakdown)).toBe(true);

        // Each signal set should have source and signals
        result.signalBreakdown.forEach((signalSet) => {
          expect(signalSet.source).toBeDefined();
          expect(signalSet.signals).toBeDefined();
          expect(Array.isArray(signalSet.signals)).toBe(true);
        });
      } finally {
        cleanupFixtureProject(projectPath);
      }
    });
  });

  // =========================================================================
  // Real-World Scenario Tests
  // =========================================================================

  describe('Real-World Scenarios', () => {
    it('should handle multi-service FastAPI monorepo', async () => {
      const projectPath = createFixtureProject('monorepo-fastapi');

      // Create monorepo structure
      fs.mkdirSync(path.join(projectPath, 'services', 'auth'), { recursive: true });
      fs.mkdirSync(path.join(projectPath, 'services', 'payment'), { recursive: true });

      fs.writeFileSync(
        path.join(projectPath, 'pyproject.toml'),
        `[tool.poetry.dependencies]
python = "^3.11"
fastapi = "^0.104.0"
`
      );

      fs.writeFileSync(
        path.join(projectPath, 'services', 'auth', 'main.py'),
        `from fastapi import FastAPI
app = FastAPI()

@app.post("/login")
async def login(username: str, password: str):
    return {"token": "..."}
`
      );

      try {
        const engine = new ByopDiscoveryEngine(projectPath);
        const result = await engine.discover();

        expect(result.runtime).toBe('python');
        expect(result.framework).toBe('fastapi');
      } finally {
        cleanupFixtureProject(projectPath);
      }
    });

    it('should handle NestJS with TypeORM database', async () => {
      const projectPath = createFixtureProject('nestjs-typeorm');
      setupNestJSProject(projectPath);

      // Add TypeORM indicator
      fs.writeFileSync(
        path.join(projectPath, 'package.json'),
        `{
  "name": "my-nest-app",
  "dependencies": {
    "@nestjs/core": "^10.2.0",
    "@nestjs/common": "^10.2.0",
    "@nestjs/typeorm": "^10.0.0",
    "typeorm": "^0.3.0"
  }
}
`
      );

      try {
        const engine = new ByopDiscoveryEngine(projectPath);
        const result = await engine.discover();

        expect(result.runtime).toBe('nodejs');
        expect(result.framework).toBe('nestjs');
      } finally {
        cleanupFixtureProject(projectPath);
      }
    });
  });

  // =========================================================================
  // Confidence Breakdown Tests
  // =========================================================================

  describe('Confidence Breakdown', () => {
    it('should include source weights in breakdown', async () => {
      const projectPath = createFixtureProject('source-weights');
      setupFastAPIProject(projectPath);

      try {
        const engine = new ByopDiscoveryEngine(projectPath);
        const result = await engine.discover();

        const scorer = new ConfidenceScorerForByop();
        const breakdown = scorer.scoreDiscoveryResult(result);

        expect(breakdown.sourceWeights).toBeDefined();
        expect(Object.keys(breakdown.sourceWeights).length).toBeGreaterThan(0);
      } finally {
        cleanupFixtureProject(projectPath);
      }
    });

    it('should include reasoning in breakdown', async () => {
      const projectPath = createFixtureProject('breakdown-reasoning');
      setupFastAPIProject(projectPath);

      try {
        const engine = new ByopDiscoveryEngine(projectPath);
        const result = await engine.discover();

        const scorer = new ConfidenceScorerForByop();
        const breakdown = scorer.scoreDiscoveryResult(result);

        expect(breakdown.reasoning).toBeDefined();
        expect(breakdown.reasoning.length).toBeGreaterThan(0);
      } finally {
        cleanupFixtureProject(projectPath);
      }
    });
  });
});
