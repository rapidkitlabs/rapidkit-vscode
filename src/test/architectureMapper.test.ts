/**
 * C03: Architecture Mapping Engine - Test Suite
 */

import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import {
  assessMappingScopeForMutation,
  FastApiArchitectureMapper,
  GoNativeArchitectureMapper,
  HeuristicArchitectureMapper,
  IncrementalArchitectureMapper,
  NativeArchitectureMapper,
  NestjsArchitectureMapper,
  shouldBlockMutationRecommendation,
  SpringBootArchitectureMapper,
} from '../core/architectureMapper';
import { validateArchitectureIR } from '../core/architectureIrValidator';
import { DiscoveryResult } from '../core/byopDiscovery';

function createTempProject(name: string): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), `mapper-${name}-`));
}

function cleanup(projectPath: string): void {
  try {
    fs.rmSync(projectPath, { recursive: true, force: true });
  } catch {
    // Ignore cleanup failures in tests.
  }
}

function discovery(overrides: Partial<DiscoveryResult>): DiscoveryResult {
  return {
    projectPath: '/tmp/project',
    runtime: 'unknown',
    framework: undefined,
    confidenceLevel: 'medium',
    reason: 'test',
    signalBreakdown: [],
    detectedAt: new Date().toISOString(),
    ...overrides,
  };
}

function setupFastApiFixture(projectPath: string): void {
  fs.writeFileSync(
    path.join(projectPath, 'pyproject.toml'),
    `[tool.poetry.dependencies]
python = "^3.11"
fastapi = "^0.110"
psycopg = "^3.1"
`
  );

  fs.writeFileSync(
    path.join(projectPath, 'main.py'),
    `from fastapi import FastAPI
from psycopg import connect

app = FastAPI(title="API")

@app.get("/health")
async def health():
  return {"ok": True}

@app.post("/orders")
async def create_order():
  return {"id": "1"}
`
  );
}

function setupNestFixture(projectPath: string): void {
  fs.mkdirSync(path.join(projectPath, 'src'), { recursive: true });

  fs.writeFileSync(
    path.join(projectPath, 'package.json'),
    JSON.stringify(
      {
        name: 'nestjs-app',
        dependencies: {
          '@nestjs/core': '^10.0.0',
          '@nestjs/common': '^10.0.0',
          typeorm: '^0.3.0',
        },
      },
      null,
      2
    )
  );

  fs.writeFileSync(
    path.join(projectPath, 'src', 'users.controller.ts'),
    `import { Controller, Get, Post } from '@nestjs/common';

@Controller('users')
export class UsersController {
  @Get('list')
  list() {
    return [];
  }

  @Post('create')
  create() {
    return { ok: true };
  }
}
`
  );
}

function setupGoFixture(projectPath: string): void {
  fs.writeFileSync(
    path.join(projectPath, 'go.mod'),
    `module sample

require github.com/gin-gonic/gin v1.9.0
`
  );

  fs.writeFileSync(
    path.join(projectPath, 'main.go'),
    `package main

import "github.com/gin-gonic/gin"

func main() {
  r := gin.Default()
  r.GET("/health", func(c *gin.Context) {})
  r.POST("/jobs", func(c *gin.Context) {})
}
`
  );
}

function setupSpringFixture(projectPath: string): void {
  const controllerDir = path.join(
    projectPath,
    'src',
    'main',
    'java',
    'com',
    'example',
    'demo',
    'controller'
  );
  fs.mkdirSync(controllerDir, { recursive: true });

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

  fs.writeFileSync(
    path.join(controllerDir, 'UsersController.java'),
    `package com.example.demo.controller;

import org.springframework.web.bind.annotation.*;

@RestController
@RequestMapping("/users")
public class UsersController {

  @GetMapping("/list")
  public String list() {
    return "ok";
  }

  @PostMapping(path = "/create")
  public String create() {
    return "created";
  }
}
`
  );
}

function setupDjangoFixture(projectPath: string): void {
  fs.writeFileSync(
    path.join(projectPath, 'pyproject.toml'),
    `[tool.poetry.dependencies]
python = "^3.11"
django = "^5.0.0"
`
  );

  fs.writeFileSync(
    path.join(projectPath, 'urls.py'),
    `from django.urls import path
from . import views

urlpatterns = [
  path('health/', views.health),
  path('users/', views.users),
]
`
  );
}

function setupFlaskFixture(projectPath: string): void {
  fs.writeFileSync(
    path.join(projectPath, 'app.py'),
    `from flask import Flask

app = Flask(__name__)

@app.route('/health', methods=['GET'])
def health():
  return {'ok': True}

@app.post('/users')
def users():
  return {'id': 1}
`
  );
}

function setupExpressFixture(projectPath: string): void {
  fs.writeFileSync(
    path.join(projectPath, 'server.js'),
    `const express = require('express');
const app = express();
app.get('/health', () => {});
app.post('/orders', () => {});
`
  );
}

function setupKoaFixture(projectPath: string): void {
  fs.writeFileSync(
    path.join(projectPath, 'server.js'),
    `const Koa = require('koa');
const Router = require('@koa/router');
const app = new Koa();
const router = new Router();
router.get('/health', async (ctx) => { ctx.body = 'ok'; });
router.post('/deploy', async (ctx) => { ctx.body = 'ok'; });
app.use(router.routes());
`
  );
}

function setupRailsFixture(projectPath: string): void {
  fs.writeFileSync(
    path.join(projectPath, 'Gemfile'),
    `source 'https://rubygems.org'
gem 'rails', '~> 7.1.0'
`
  );

  fs.mkdirSync(path.join(projectPath, 'config'), { recursive: true });
  fs.writeFileSync(
    path.join(projectPath, 'config', 'routes.rb'),
    `Rails.application.routes.draw do
  get '/health', to: 'health#show'
  resources :users
end
`
  );
}

function setupDotnetFixture(projectPath: string): void {
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

  fs.mkdirSync(path.join(projectPath, 'Controllers'), { recursive: true });
  fs.writeFileSync(
    path.join(projectPath, 'Controllers', 'UsersController.cs'),
    `using Microsoft.AspNetCore.Mvc;

[ApiController]
[Route("api/[controller]")]
public class UsersController : ControllerBase
{
  [HttpGet("list")]
  public IActionResult List() => Ok();

  [HttpPost("create")]
  public IActionResult Create() => Ok();
}
`
  );
}

describe('C03: Architecture Mapping Engine', () => {
  let projectPath: string;

  beforeEach(() => {
    projectPath = createTempProject('architecture-mapper');
  });

  afterEach(() => {
    cleanup(projectPath);
  });

  it('maps FastAPI routes and datastore with native mapper', async () => {
    setupFastApiFixture(projectPath);

    const mapper = new FastApiArchitectureMapper();
    const ir = await mapper.mapToIR(
      projectPath,
      discovery({ runtime: 'python', framework: 'fastapi', confidenceLevel: 'high' })
    );

    expect(ir.runtime).toBe('python');
    expect(ir.framework).toBe('fastapi');
    expect(ir.metadata.mapperType).toBe('native');
    expect(ir.topology.services.length).toBeGreaterThan(0);
    expect(ir.topology.dataStores.some((store) => store.type === 'postgres')).toBe(true);

    const handlers = ir.topology.services.flatMap((service) => service.handlers);
    expect(handlers.some((handler) => handler.path === '/health')).toBe(true);
    expect(handlers.some((handler) => handler.path === '/orders')).toBe(true);
  });

  it('returns validator-compatible IR payload for native mapping', async () => {
    setupFastApiFixture(projectPath);

    const mapper = new FastApiArchitectureMapper();
    const ir = await mapper.mapToIR(
      projectPath,
      discovery({ runtime: 'python', framework: 'fastapi', confidenceLevel: 'high' })
    );

    const result = validateArchitectureIR(ir);
    expect(result.isValid).toBe(true);
    expect(result.errors.length).toBe(0);
  });

  it('maps NestJS controllers and routes with native mapper', async () => {
    setupNestFixture(projectPath);

    const mapper = new NestjsArchitectureMapper();
    const ir = await mapper.mapToIR(
      projectPath,
      discovery({ runtime: 'nodejs', framework: 'nestjs', confidenceLevel: 'high' })
    );

    expect(ir.metadata.mapperType).toBe('native');
    expect(ir.topology.services.length).toBeGreaterThan(0);

    const handlers = ir.topology.services.flatMap((service) => service.handlers);
    expect(handlers.some((handler) => handler.path === '/users/list')).toBe(true);
    expect(handlers.some((handler) => handler.path === '/users/create')).toBe(true);
  });

  it('maps Go/Gin routes with native mapper', async () => {
    setupGoFixture(projectPath);

    const mapper = new GoNativeArchitectureMapper();
    const ir = await mapper.mapToIR(
      projectPath,
      discovery({ runtime: 'go', framework: 'gogin', confidenceLevel: 'high' })
    );

    const handlers = ir.topology.services.flatMap((service) => service.handlers);
    expect(handlers.some((handler) => handler.path === '/health')).toBe(true);
    expect(handlers.some((handler) => handler.path === '/jobs')).toBe(true);
  });

  it('maps Spring Boot routes with direct native mapper', async () => {
    setupSpringFixture(projectPath);

    const mapper = new SpringBootArchitectureMapper();
    const ir = await mapper.mapToIR(
      projectPath,
      discovery({ runtime: 'java', framework: 'springboot', confidenceLevel: 'high' })
    );

    expect(ir.metadata.mapperType).toBe('native');
    expect(ir.runtime).toBe('java');
    expect(ir.framework).toBe('springboot');

    const handlers = ir.topology.services.flatMap((service) => service.handlers);
    expect(handlers.some((handler) => handler.path === '/users/list')).toBe(true);
    expect(handlers.some((handler) => handler.path === '/users/create')).toBe(true);
  });

  it('routes Spring detection to native mapper via router', async () => {
    setupSpringFixture(projectPath);

    const mapper = new NativeArchitectureMapper();
    const ir = await mapper.mapToIR(
      projectPath,
      discovery({ runtime: 'java', framework: 'springboot', confidenceLevel: 'high' })
    );

    expect(ir.metadata.mapperType).toBe('native');
    expect(ir.topology.services.length).toBeGreaterThan(0);
  });

  it('maps Django urls with native router', async () => {
    setupDjangoFixture(projectPath);

    const mapper = new NativeArchitectureMapper();
    const ir = await mapper.mapToIR(
      projectPath,
      discovery({ runtime: 'python', framework: 'django', confidenceLevel: 'high' })
    );

    const handlers = ir.topology.services.flatMap((service) => service.handlers);
    expect(ir.metadata.mapperType).toBe('native');
    expect(handlers.some((handler) => handler.path === '/health/')).toBe(true);
    expect(handlers.some((handler) => handler.path === '/users/')).toBe(true);
  });

  it('maps Flask routes with native router', async () => {
    setupFlaskFixture(projectPath);

    const mapper = new NativeArchitectureMapper();
    const ir = await mapper.mapToIR(
      projectPath,
      discovery({ runtime: 'python', framework: 'flask', confidenceLevel: 'high' })
    );

    const handlers = ir.topology.services.flatMap((service) => service.handlers);
    expect(ir.metadata.mapperType).toBe('native');
    expect(handlers.some((handler) => handler.path === '/health')).toBe(true);
    expect(handlers.some((handler) => handler.path === '/users')).toBe(true);
  });

  it('maps Express routes with native router', async () => {
    setupExpressFixture(projectPath);

    const mapper = new NativeArchitectureMapper();
    const ir = await mapper.mapToIR(
      projectPath,
      discovery({ runtime: 'nodejs', framework: 'express', confidenceLevel: 'high' })
    );

    const handlers = ir.topology.services.flatMap((service) => service.handlers);
    expect(ir.metadata.mapperType).toBe('native');
    expect(handlers.some((handler) => handler.path === '/health')).toBe(true);
    expect(handlers.some((handler) => handler.path === '/orders')).toBe(true);
  });

  it('maps Koa routes with native router', async () => {
    setupKoaFixture(projectPath);

    const mapper = new NativeArchitectureMapper();
    const ir = await mapper.mapToIR(
      projectPath,
      discovery({ runtime: 'nodejs', framework: 'koa', confidenceLevel: 'high' })
    );

    const handlers = ir.topology.services.flatMap((service) => service.handlers);
    expect(ir.metadata.mapperType).toBe('native');
    expect(handlers.some((handler) => handler.path === '/health')).toBe(true);
    expect(handlers.some((handler) => handler.path === '/deploy')).toBe(true);
  });

  it('maps Rails routes with native router', async () => {
    setupRailsFixture(projectPath);

    const mapper = new NativeArchitectureMapper();
    const ir = await mapper.mapToIR(
      projectPath,
      discovery({ runtime: 'ruby', framework: 'rails', confidenceLevel: 'high' })
    );

    const handlers = ir.topology.services.flatMap((service) => service.handlers);
    expect(ir.metadata.mapperType).toBe('native');
    expect(handlers.some((handler) => handler.path === '/health')).toBe(true);
    expect(handlers.some((handler) => handler.path === '/users')).toBe(true);
  });

  it('maps Dotnet controller routes with native router', async () => {
    setupDotnetFixture(projectPath);

    const mapper = new NativeArchitectureMapper();
    const ir = await mapper.mapToIR(
      projectPath,
      discovery({ runtime: 'csharp', framework: 'dotnet', confidenceLevel: 'high' })
    );

    const handlers = ir.topology.services.flatMap((service) => service.handlers);
    expect(ir.metadata.mapperType).toBe('native');
    expect(handlers.some((handler) => handler.path === '/api/users/list')).toBe(true);
    expect(handlers.some((handler) => handler.path === '/api/users/create')).toBe(true);
  });

  it('routes unsupported framework to heuristic mapper', async () => {
    setupExpressFixture(projectPath);

    const mapper = new NativeArchitectureMapper();
    const ir = await mapper.mapToIR(
      projectPath,
      discovery({ runtime: 'nodejs', framework: 'unknown-framework', confidenceLevel: 'medium' })
    );

    expect(ir.metadata.mapperType).toBe('heuristic');
    expect(ir.topology.services.length).toBeGreaterThan(0);
    expect(ir.metadata.blockMutationWhenScopeUnknown).toBe(true);
    expect((ir.metadata.blockedReasons ?? []).length).toBeGreaterThan(0);
  });

  it('keeps mutation path open for native high-confidence mapped scope', async () => {
    setupExpressFixture(projectPath);

    const mapper = new NativeArchitectureMapper();
    const ir = await mapper.mapToIR(
      projectPath,
      discovery({ runtime: 'nodejs', framework: 'express', confidenceLevel: 'high' })
    );

    const assessment = assessMappingScopeForMutation(ir, {
      framework: 'express',
      confidenceLevel: 'high',
    });

    expect(assessment.unknownScope).toBe(false);
    expect(assessment.scopeCoverage).toBe('known');
    expect(
      shouldBlockMutationRecommendation(ir, { framework: 'express', confidenceLevel: 'high' })
    ).toBe(false);
  });

  it('heuristic mapper detects handlers from entry points', async () => {
    setupExpressFixture(projectPath);

    const mapper = new HeuristicArchitectureMapper();
    const ir = await mapper.mapToIR(
      projectPath,
      discovery({ runtime: 'nodejs', confidenceLevel: 'medium' })
    );

    const handlers = ir.topology.services.flatMap((service) => service.handlers);
    expect(handlers.some((handler) => handler.path === '/health')).toBe(true);
    expect(handlers.some((handler) => handler.path === '/orders')).toBe(true);
  });

  it('heuristic mapper creates fallback service for empty projects', async () => {
    fs.writeFileSync(path.join(projectPath, 'README.md'), 'project');

    const mapper = new HeuristicArchitectureMapper();
    const ir = await mapper.mapToIR(
      projectPath,
      discovery({ runtime: 'unknown', confidenceLevel: 'low' })
    );

    expect(ir.topology.services.length).toBe(1);
    expect(ir.topology.services[0].confidenceLevel).toBe('low');
  });

  it('heuristic mapper detects redis datastore from source evidence', async () => {
    fs.writeFileSync(path.join(projectPath, 'main.py'), `import redis\nclient = redis.Redis()`);

    const mapper = new HeuristicArchitectureMapper();
    const ir = await mapper.mapToIR(
      projectPath,
      discovery({ runtime: 'python', confidenceLevel: 'medium' })
    );

    expect(ir.topology.dataStores.some((store) => store.type === 'redis')).toBe(true);
  });

  it('incremental mapper refreshes mapping metadata on changed files', async () => {
    setupFastApiFixture(projectPath);

    const baseMapper = new FastApiArchitectureMapper();
    const baseIr = await baseMapper.mapToIR(
      projectPath,
      discovery({ runtime: 'python', framework: 'fastapi', confidenceLevel: 'high' })
    );

    const touched = path.join(projectPath, 'main.py');
    const firstKey = Object.keys(baseIr.mapping)[0];
    const previousMappedAt = baseIr.mapping[firstKey].mappedAt;

    const mapper = new IncrementalArchitectureMapper();
    const nextIr = await mapper.updateIR(projectPath, baseIr, [touched]);

    const changedMapping = nextIr.mapping[firstKey];
    expect(changedMapping.mappedAt >= previousMappedAt).toBe(true);
  });

  it('incremental mapper adds services from changed service-like files', async () => {
    setupFastApiFixture(projectPath);

    const baseMapper = new FastApiArchitectureMapper();
    const baseIr = await baseMapper.mapToIR(
      projectPath,
      discovery({ runtime: 'python', framework: 'fastapi', confidenceLevel: 'high' })
    );

    fs.mkdirSync(path.join(projectPath, 'src'), { recursive: true });
    const changed = path.join(projectPath, 'src', 'billing.service.ts');
    fs.writeFileSync(changed, 'export class BillingService {}');

    const mapper = new IncrementalArchitectureMapper();
    const nextIr = await mapper.updateIR(projectPath, baseIr, [changed]);

    expect(nextIr.topology.services.length).toBe(baseIr.topology.services.length + 1);
  });

  it('incremental mapper does not duplicate existing service candidates', async () => {
    fs.writeFileSync(
      path.join(projectPath, 'main.py'),
      'from fastapi import FastAPI\napp = FastAPI()'
    );

    const heuristic = new HeuristicArchitectureMapper();
    const baseIr = await heuristic.mapToIR(
      projectPath,
      discovery({ runtime: 'python', confidenceLevel: 'medium' })
    );

    const mapper = new IncrementalArchitectureMapper();
    const nextIr = await mapper.updateIR(projectPath, baseIr, [path.join(projectPath, 'main.py')]);

    expect(nextIr.topology.services.length).toBe(baseIr.topology.services.length);
  });

  it('preserves project identity when existing IR is provided', async () => {
    setupFastApiFixture(projectPath);

    const firstMapper = new HeuristicArchitectureMapper();
    const existing = await firstMapper.mapToIR(
      projectPath,
      discovery({ runtime: 'python', confidenceLevel: 'medium' })
    );

    const native = new FastApiArchitectureMapper();
    const nextIr = await native.mapToIR(
      projectPath,
      discovery({ runtime: 'python', framework: 'fastapi', confidenceLevel: 'high' }),
      existing
    );

    expect(nextIr.projectId).toBe(existing.projectId);
    expect(nextIr.projectName).toBe(existing.projectName);
  });

  it('keeps heuristic confidence lower than native confidence', async () => {
    setupExpressFixture(projectPath);

    const heuristic = new HeuristicArchitectureMapper();
    const heuristicIr = await heuristic.mapToIR(
      projectPath,
      discovery({ runtime: 'nodejs', confidenceLevel: 'medium' })
    );

    const native = new NativeArchitectureMapper();
    const nativeIr = await native.mapToIR(
      projectPath,
      discovery({ runtime: 'nodejs', framework: 'express', confidenceLevel: 'high' })
    );

    const heuristicConf = heuristicIr.mapping[Object.keys(heuristicIr.mapping)[0]].confidence;
    const nativeConf = nativeIr.mapping[Object.keys(nativeIr.mapping)[0]].confidence;
    expect(heuristicConf).toBeLessThanOrEqual(nativeConf);
  });

  it('generates low-confidence mapping for unknown projects', async () => {
    const mapper = new HeuristicArchitectureMapper();
    const ir = await mapper.mapToIR(
      projectPath,
      discovery({ runtime: 'unknown', confidenceLevel: 'low' })
    );

    expect(ir.metadata.mapperType).toBe('heuristic');
    expect(ir.metadata.confidenceLevel).toBe('low');
  });
});
