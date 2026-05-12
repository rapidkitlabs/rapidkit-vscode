/**
 * C02: BYOP Framework Detection Profiles
 *
 * Profiles define detection signals and metadata for supported frameworks
 * across Python, Node.js, Go, Java, Ruby, and C# runtimes.
 */

export type FrameworkName =
  | 'fastapi'
  | 'django'
  | 'flask'
  | 'nestjs'
  | 'express'
  | 'koa'
  | 'gofiber'
  | 'gin'
  | 'echo'
  | 'spring'
  | 'rails'
  | 'dotnet'
  | 'unknown';

export interface DetectionSignal {
  source: 'packageManager' | 'imports' | 'entrypoint' | 'dockerfile';
  pattern: RegExp | string;
  weight: number; // 0-1, higher = more reliable
}

export interface FrameworkProfile {
  name: FrameworkName;
  runtime: 'python' | 'nodejs' | 'go' | 'java' | 'ruby' | 'csharp';
  detectionSignals: DetectionSignal[];
  filePatterns: RegExp[]; // Common file names/paths for this framework
  entryPointPatterns: RegExp[]; // Code patterns to look for
  dependencyPatterns: RegExp[]; // Package/module names to detect
  runCommand?: string; // Default run command
  testCommand?: string; // Default test command
  buildCommand?: string; // Default build command
  description: string;
  popularity: 'high' | 'medium' | 'low'; // For tiebreaker votes
}

// ============================================================================
// FastAPI Profile (Python)
// ============================================================================

export const FASTAPI_PROFILE: FrameworkProfile = {
  name: 'fastapi',
  runtime: 'python',
  detectionSignals: [
    {
      source: 'packageManager',
      pattern: /fastapi/,
      weight: 0.98,
    },
    {
      source: 'imports',
      pattern: /from fastapi import/,
      weight: 0.95,
    },
    {
      source: 'entrypoint',
      pattern: /FastAPI\(\)/,
      weight: 0.99,
    },
  ],
  filePatterns: [/main\.py$/, /app\.py$/, /server\.py$/, /api\.py$/],
  entryPointPatterns: [
    /FastAPI\(\)/,
    /app\s*=\s*FastAPI/,
    /@app\.get|@app\.post|@app\.put|@app\.delete/,
  ],
  dependencyPatterns: [/fastapi/],
  runCommand: 'python main.py',
  testCommand: 'pytest tests/',
  buildCommand: 'pip install -r requirements.txt',
  description: 'Modern Python API framework for building REST/async APIs with OpenAPI support',
  popularity: 'high',
};

// ============================================================================
// Django Profile (Python)
// ============================================================================

export const DJANGO_PROFILE: FrameworkProfile = {
  name: 'django',
  runtime: 'python',
  detectionSignals: [
    {
      source: 'packageManager',
      pattern: /django/,
      weight: 0.98,
    },
    {
      source: 'imports',
      pattern: /django\./,
      weight: 0.9,
    },
    {
      source: 'entrypoint',
      pattern: /django-admin|manage\.py/,
      weight: 0.95,
    },
  ],
  filePatterns: [/manage\.py$/, /wsgi\.py$/, /settings\.py$/, /urls\.py$/],
  entryPointPatterns: [/INSTALLED_APPS/, /MIDDLEWARE/, /django\.setup/, /django\.core\.wsgi/],
  dependencyPatterns: [/^django$/, /django-/],
  runCommand: 'python manage.py runserver',
  testCommand: 'python manage.py test',
  buildCommand: 'pip install -r requirements.txt',
  description: 'Full-featured Python web framework with ORM, admin panel, and batteries-included',
  popularity: 'high',
};

// ============================================================================
// Flask Profile (Python)
// ============================================================================

export const FLASK_PROFILE: FrameworkProfile = {
  name: 'flask',
  runtime: 'python',
  detectionSignals: [
    {
      source: 'packageManager',
      pattern: /flask/,
      weight: 0.98,
    },
    {
      source: 'imports',
      pattern: /from flask import/,
      weight: 0.95,
    },
    {
      source: 'entrypoint',
      pattern: /Flask\(__name__\)/,
      weight: 0.99,
    },
  ],
  filePatterns: [/app\.py$/, /server\.py$/, /main\.py$/],
  entryPointPatterns: [/Flask\(/, /app\s*=\s*Flask/, /@app\.route|@app\.get|@app\.post/],
  dependencyPatterns: [/^flask$/],
  runCommand: 'flask run',
  testCommand: 'pytest tests/',
  buildCommand: 'pip install -r requirements.txt',
  description: 'Lightweight Python web framework for rapid API and web application development',
  popularity: 'high',
};

// ============================================================================
// NestJS Profile (Node.js)
// ============================================================================

export const NESTJS_PROFILE: FrameworkProfile = {
  name: 'nestjs',
  runtime: 'nodejs',
  detectionSignals: [
    {
      source: 'packageManager',
      pattern: /@nestjs\/core/,
      weight: 0.99,
    },
    {
      source: 'imports',
      pattern: /@nestjs/,
      weight: 0.98,
    },
    {
      source: 'entrypoint',
      pattern: /NestFactory\.create/,
      weight: 0.99,
    },
  ],
  filePatterns: [/main\.ts$/, /app\.module\.ts$/, /\.controller\.ts$/, /\.service\.ts$/],
  entryPointPatterns: [/NestFactory\.create/, /@Module\(\)/, /@Controller\(\)/, /@Injectable\(\)/],
  dependencyPatterns: [/@nestjs\/core/, /@nestjs\/common/],
  runCommand: 'npm start',
  testCommand: 'npm run test',
  buildCommand: 'npm run build',
  description: 'Opinionated TypeScript/Node.js framework for enterprise-grade REST/GraphQL APIs',
  popularity: 'high',
};

// ============================================================================
// Express Profile (Node.js)
// ============================================================================

export const EXPRESS_PROFILE: FrameworkProfile = {
  name: 'express',
  runtime: 'nodejs',
  detectionSignals: [
    {
      source: 'packageManager',
      pattern: /^express$/,
      weight: 0.9,
    },
    {
      source: 'imports',
      pattern: /require\(['"]express['"]\)|import.*from.*['"]express['"]/,
      weight: 0.85,
    },
    {
      source: 'entrypoint',
      pattern: /express\(\)|app\.listen/,
      weight: 0.9,
    },
  ],
  filePatterns: [/server\.js$/, /app\.js$/, /index\.js$/, /main\.js$/],
  entryPointPatterns: [
    /const app\s*=\s*express\(\)/,
    /app\.get|app\.post|app\.put|app\.delete/,
    /app\.use\(/,
  ],
  dependencyPatterns: [/^express$/],
  runCommand: 'npm start',
  testCommand: 'npm run test',
  buildCommand: 'npm install',
  description:
    'Minimalist Node.js web framework for flexible REST API and web application development',
  popularity: 'high',
};

// ============================================================================
// Koa Profile (Node.js)
// ============================================================================

export const KOA_PROFILE: FrameworkProfile = {
  name: 'koa',
  runtime: 'nodejs',
  detectionSignals: [
    {
      source: 'packageManager',
      pattern: /^koa$/,
      weight: 0.95,
    },
    {
      source: 'imports',
      pattern: /require\(['"]koa['"]\)|import.*from.*['"]koa['"]/,
      weight: 0.92,
    },
    {
      source: 'entrypoint',
      pattern: /new Koa\(\)|app\.listen/,
      weight: 0.95,
    },
  ],
  filePatterns: [/app\.js$/, /server\.js$/, /index\.js$/],
  entryPointPatterns: [/new Koa\(\)/, /app\.use\(/, /ctx\.body|ctx\.request/],
  dependencyPatterns: [/^koa$/, /^koa-router$/],
  runCommand: 'npm start',
  testCommand: 'npm run test',
  buildCommand: 'npm install',
  description: 'Modern Node.js web framework with async/await middleware and minimal overhead',
  popularity: 'medium',
};

// ============================================================================
// GoFiber Profile (Go)
// ============================================================================

export const GOFIBER_PROFILE: FrameworkProfile = {
  name: 'gofiber',
  runtime: 'go',
  detectionSignals: [
    {
      source: 'packageManager',
      pattern: /github\.com\/gofiber\/fiber/,
      weight: 0.99,
    },
    {
      source: 'imports',
      pattern: /"github\.com\/gofiber\/fiber(?:\/v2)?"/,
      weight: 0.98,
    },
    {
      source: 'entrypoint',
      pattern: /fiber\.New\(\)/,
      weight: 0.99,
    },
  ],
  filePatterns: [/main\.go$/],
  entryPointPatterns: [
    /fiber\.New\(\)/,
    /app\.Get|app\.Post|app\.Put|app\.Delete/,
    /app\.Listen\(/,
  ],
  dependencyPatterns: [/github\.com\/gofiber\/fiber/],
  runCommand: 'go run main.go',
  testCommand: 'go test ./...',
  buildCommand: 'go build',
  description: 'Express-inspired Go web framework focused on speed, low overhead, and ergonomics',
  popularity: 'high',
};

// ============================================================================
// Gin Profile (Go)
// ============================================================================

export const GIN_PROFILE: FrameworkProfile = {
  name: 'gin',
  runtime: 'go',
  detectionSignals: [
    {
      source: 'packageManager',
      pattern: /github\.com\/gin-gonic\/gin/,
      weight: 0.99,
    },
    {
      source: 'imports',
      pattern: /"github\.com\/gin-gonic\/gin"/,
      weight: 0.98,
    },
    {
      source: 'entrypoint',
      pattern: /gin\.Default\(\)|gin\.New\(\)/,
      weight: 0.99,
    },
  ],
  filePatterns: [/main\.go$/],
  entryPointPatterns: [
    /gin\.Default\(\)/,
    /gin\.New\(\)/,
    /router\.GET|router\.POST|router\.PUT|router\.DELETE/,
  ],
  dependencyPatterns: [/github\.com\/gin-gonic\/gin/],
  runCommand: 'go run main.go',
  testCommand: 'go test ./...',
  buildCommand: 'go build',
  description: 'High-performance Go web framework with excellent routing and middleware support',
  popularity: 'high',
};

// ============================================================================
// Echo Profile (Go)
// ============================================================================

export const ECHO_PROFILE: FrameworkProfile = {
  name: 'echo',
  runtime: 'go',
  detectionSignals: [
    {
      source: 'packageManager',
      pattern: /github\.com\/labstack\/echo/,
      weight: 0.99,
    },
    {
      source: 'imports',
      pattern: /"github\.com\/labstack\/echo"/,
      weight: 0.98,
    },
    {
      source: 'entrypoint',
      pattern: /echo\.New\(\)/,
      weight: 0.99,
    },
  ],
  filePatterns: [/main\.go$/],
  entryPointPatterns: [/echo\.New\(\)/, /e\.GET|e\.POST|e\.PUT|e\.DELETE/, /e\.Start\(/],
  dependencyPatterns: [/github\.com\/labstack\/echo/],
  runCommand: 'go run main.go',
  testCommand: 'go test ./...',
  buildCommand: 'go build',
  description: 'Fast and scalable Go web framework with flexible middleware and rich features',
  popularity: 'high',
};

// ============================================================================
// Spring Boot Profile (Java)
// ============================================================================

export const SPRING_PROFILE: FrameworkProfile = {
  name: 'spring',
  runtime: 'java',
  detectionSignals: [
    {
      source: 'packageManager',
      pattern: /org\.springframework\.boot/,
      weight: 0.99,
    },
    {
      source: 'imports',
      pattern: /import org\.springframework/,
      weight: 0.98,
    },
    {
      source: 'entrypoint',
      pattern: /@SpringBootApplication/,
      weight: 0.99,
    },
  ],
  filePatterns: [/Application\.java$/, /DemoApplication\.java$/],
  entryPointPatterns: [
    /@SpringBootApplication/,
    /@RestController/,
    /@RequestMapping/,
    /SpringApplication\.run/,
  ],
  dependencyPatterns: [/org\.springframework\.boot.*spring-boot-starter-web/],
  runCommand: 'mvn spring-boot:run',
  testCommand: 'mvn test',
  buildCommand: 'mvn clean install',
  description: 'Production-grade Java framework for building REST APIs and web applications',
  popularity: 'high',
};

// ============================================================================
// Rails Profile (Ruby)
// ============================================================================

export const RAILS_PROFILE: FrameworkProfile = {
  name: 'rails',
  runtime: 'ruby',
  detectionSignals: [
    {
      source: 'packageManager',
      pattern: /rails/,
      weight: 0.98,
    },
    {
      source: 'imports',
      pattern: /require.*rails|require.*'rails'/,
      weight: 0.95,
    },
    {
      source: 'entrypoint',
      pattern: /config\/application\.rb/,
      weight: 0.95,
    },
  ],
  filePatterns: [/Rakefile$/, /config\/application\.rb$/],
  entryPointPatterns: [/module.*::Application/, /config\.load_defaults/, /ApplicationController/],
  dependencyPatterns: [/^rails$/],
  runCommand: 'rails server',
  testCommand: 'rails test',
  buildCommand: 'bundle install',
  description:
    'Opinionated Ruby web framework with convention-over-configuration for rapid API development',
  popularity: 'high',
};

// ============================================================================
// .NET Core Profile (C#)
// ============================================================================

export const DOTNET_PROFILE: FrameworkProfile = {
  name: 'dotnet',
  runtime: 'csharp',
  detectionSignals: [
    {
      source: 'packageManager',
      pattern: /\.csproj|Microsoft\.AspNetCore/,
      weight: 0.98,
    },
    {
      source: 'imports',
      pattern: /using Microsoft\.AspNetCore|using System\.Net\.Http/,
      weight: 0.95,
    },
    {
      source: 'entrypoint',
      pattern: /\.CreateWebHostBuilder|\.CreateHostBuilder/,
      weight: 0.98,
    },
  ],
  filePatterns: [/Program\.cs$/, /Startup\.cs$/, /.*Controller\.cs$/],
  entryPointPatterns: [/CreateWebHostBuilder|CreateHostBuilder/, /\[ApiController\]/, /\[Route\(/],
  dependencyPatterns: [/Microsoft\.AspNetCore/],
  runCommand: 'dotnet run',
  testCommand: 'dotnet test',
  buildCommand: 'dotnet build',
  description:
    'Modern C# framework for building high-performance REST APIs and cloud-native applications',
  popularity: 'high',
};

// ============================================================================
// Profile Registry
// ============================================================================

export const FRAMEWORK_PROFILES: Record<FrameworkName, FrameworkProfile> = {
  fastapi: FASTAPI_PROFILE,
  django: DJANGO_PROFILE,
  flask: FLASK_PROFILE,
  nestjs: NESTJS_PROFILE,
  express: EXPRESS_PROFILE,
  koa: KOA_PROFILE,
  gofiber: GOFIBER_PROFILE,
  gin: GIN_PROFILE,
  echo: ECHO_PROFILE,
  spring: SPRING_PROFILE,
  rails: RAILS_PROFILE,
  dotnet: DOTNET_PROFILE,
  unknown: {
    name: 'unknown',
    runtime: 'unknown',
    detectionSignals: [],
    filePatterns: [],
    entryPointPatterns: [],
    dependencyPatterns: [],
    description: 'Unknown framework',
    popularity: 'low',
  } as any,
};

/**
 * Get framework profile by name
 */
export function getFrameworkProfile(name: FrameworkName): FrameworkProfile | null {
  return FRAMEWORK_PROFILES[name] || null;
}

/**
 * Get all profiles for a specific runtime
 */
export function getProfilesByRuntime(runtime: string): FrameworkProfile[] {
  return Object.values(FRAMEWORK_PROFILES).filter((profile) => profile.runtime === runtime);
}

/**
 * Get all profiles sorted by popularity
 */
export function getAllProfiles(): FrameworkProfile[] {
  return Object.values(FRAMEWORK_PROFILES)
    .filter((profile) => profile.name !== 'unknown')
    .sort((a, b) => {
      const popularityOrder = { high: 3, medium: 2, low: 1 };
      return popularityOrder[b.popularity] - popularityOrder[a.popularity];
    });
}
