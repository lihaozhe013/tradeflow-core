import express, { Express, Request, Response, NextFunction } from "express";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import cors from "cors";
import type { AppConfig, CustomError } from "@/types/index";
import { appConfigPath } from "@/utils/paths";
import { logger } from "@/utils/logger";
import { requestLogger, errorLogger } from "@/utils/loggerMiddleware";
import { authenticateToken, checkWritePermission } from "@/utils/auth";
import overviewRoutes from "@/routes/overview";
import inboundRoutes from "@/routes/inbound";
import outboundRoutes from "@/routes/outbound";
import inventoryRoutes from "@/routes/inventory";
import partnersRoutes from "@/routes/partners";
import productsRoutes from "@/routes/products";
import productPricesRoutes from "@/routes/productPrices";
import receivableRoutes from "@/routes/receivable";
import payableRoutes from "@/routes/payable";
import exportRoutes from "@/routes/export";
import analysisRoutes from "@/routes/analysis/analysis";
import aboutRoutes from "@/routes/about";
import authRoutes from "@/routes/auth";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app: Express = express();

const config: AppConfig = JSON.parse(fs.readFileSync(appConfigPath, "utf8"));

// Port Config
const PORT: number =
  Number(process.env["PORT"]) || config.server?.httpPort || 8080;

// =============================================================================
// DB Init
// =============================================================================

// Check and upgrade database structures upon startup
// database init is handled by Prisma
logger.info("Database initialization completed!");

// Logger Middleware
app.use(requestLogger);

// JSON Middleware
app.use(express.json());

// CORS Config (Only for Dev Mode)
if (process.env["NODE_ENV"] !== "production") {
  app.use(
    cors({
      origin: [
        "http://localhost:5173",
        `http://localhost:${PORT}`,
        "http://127.0.0.1:5173",
      ],
      credentials: true,
    })
  );
  console.log("Dev Mode: CORS cross-origin support has been enabled.");
  logger.info("Dev Mode: CORS cross-origin support has been enabled.");
}

// =============================================================================
// API Route Registration
// =============================================================================

app.use("/api/auth", authRoutes);

app.use("/api", (req, res, next) => {
  if (req.path.startsWith("/auth/")) {
    return next();
  }
  return authenticateToken(req, res, next);
});

app.use("/api", (req, res, next) => {
  if (req.path.startsWith("/auth/")) {
    return next();
  }
  return checkWritePermission(req, res, next);
});

app.use("/api/overview", overviewRoutes);
app.use("/api/inbound", inboundRoutes);
app.use("/api/outbound", outboundRoutes);
app.use("/api/inventory", inventoryRoutes);
app.use("/api/partners", partnersRoutes);
app.use("/api/products", productsRoutes);
app.use("/api/product-prices", productPricesRoutes);
app.use("/api/receivable", receivableRoutes);
app.use("/api/payable", payableRoutes);
app.use("/api/export", exportRoutes);
app.use("/api/analysis", analysisRoutes);
app.use("/api/about", aboutRoutes);

// =============================================================================
// Error Message Middleware
// =============================================================================

app.use(errorLogger);

app.use(
  (err: CustomError, req: Request, res: Response, _next: NextFunction) => {
    logger.error("Unhandled Error", {
      error: err.message,
      stack: err.stack,
      url: req.originalUrl,
      method: req.method,
    });

    res.status(500).json({
      success: false,
      message:
        process.env["NODE_ENV"] === "production"
          ? "Internal Server Error"
          : err.message,
    });
  }
);

// =============================================================================
// Frontend Static File Hosting (Based on Config File)
// =============================================================================

// Frontend Static File Hosting (Production Mode Only)
const shouldHostFrontend: boolean = !!(
  config.frontend?.hostByBackend &&
  (process.env["NODE_ENV"] === "production" ||
    process.env["FORCE_FRONTEND_HOSTING"] === "true")
);

if (shouldHostFrontend && config.frontend) {
  const frontendDist: string = path.resolve(
    __dirname,
    "..",
    config.frontend.distPath || "./frontend"
  );

  logger.info(`Frontend hosting has been enabled: ${frontendDist}`);

  if (fs.existsSync(frontendDist)) {
    app.use(express.static(frontendDist));

    // SPA Route Fallback
    if (config.frontend.fallbackToIndex) {
      app.get(/^\/(?!api).*/, (_req: Request, res: Response) => {
        res.sendFile(path.join(frontendDist, "index.html"));
      });
    }

    logger.info("Frontend file hosting has been enabled!");
  } else {
    logger.warn(`The frontend build directory does not exist!`);
  }
} else {
  logger.info(
    "Frontend hosting has been disabled. Use a standalone frontend CDN server!"
  );
}

// =============================================================================
// Start Server
// =============================================================================

app.listen(PORT, () => {
  console.log("Server Start Complete!");

  logger.info("Server Start Complete!", {
    port: PORT,
    environment: process.env["NODE_ENV"] || "development",
    pid: process.pid,
    frontend_hosted: shouldHostFrontend,
  });

  if (process.env["NODE_ENV"] === "production") {
    console.log("Running Production Mode...");
  } else {
    console.log("Development mode is running...");
  }
});
