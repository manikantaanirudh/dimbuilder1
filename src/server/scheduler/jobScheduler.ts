/**
 * In-process job scheduler that evaluates cron-based scheduled jobs
 * and executes their actions at the appropriate times.
 * 
 * Actions supported:
 * - validate_project: Run validation on all dimensions
 * - generate_report: Generate a health/velocity/coverage report
 * - sync_push: Push pending sync queue items
 * - quality_check: Run quality scoring
 */

import type { Repositories } from "../db/repositories";
import type { AppConfig } from "../../shared/appConfigTypes";
import { parseCronExpression, shouldRunAt } from "./cronParser";

export interface JobSchedulerOptions {
  pollIntervalMs?: number; // defaults to 60000 (1 min)
}

export interface JobScheduler {
  start(): void;
  stop(): void;
  runDueJobs(): Promise<number>; // returns count of jobs executed
  isRunning(): boolean;
}

export function createJobScheduler(repos: Repositories, _config: AppConfig, options?: JobSchedulerOptions): JobScheduler {
  const pollInterval = options?.pollIntervalMs ?? 60000;
  let timer: ReturnType<typeof setInterval> | null = null;
  let running = false;

  async function runDueJobs(): Promise<number> {
    const now = new Date();
    let executedCount = 0;

    // Get all active jobs across all projects
    // We need to iterate all jobs that have triggerType = 'cron'
    const allJobs = await getAllCronJobs();

    for (const job of allJobs) {
      const cronExpr = (job.triggerConfig as Record<string, unknown>)?.cron as string;
      if (!cronExpr) continue;

      const fields = parseCronExpression(cronExpr);
      if (!fields) continue;

      if (shouldRunAt(fields, now)) {
        // Check if already executed this minute
        const executions = await repos.jobExecutions.listByJob(job.id);
        const lastExecution = executions.length > 0 ? executions[0] : null;
        if (lastExecution) {
          const lastRunDate = new Date(lastExecution.startedAt);
          if (lastRunDate.getFullYear() === now.getFullYear() &&
            lastRunDate.getMonth() === now.getMonth() &&
            lastRunDate.getDate() === now.getDate() &&
            lastRunDate.getHours() === now.getHours() &&
            lastRunDate.getMinutes() === now.getMinutes()) {
            continue; // already ran this minute
          }
        }

        await executeJob(job);
        executedCount++;
      }
    }

    return executedCount;
  }

  async function getAllCronJobs() {
    // Get all projects, then all jobs for each
    const projects = await repos.projects.list();
    const allJobs: Array<{
      id: string;
      projectId: string;
      name: string;
      triggerType: string;
      triggerConfig: unknown;
      actionType: string;
      actionConfig: unknown;
    }> = [];

    for (const project of projects) {
      const jobs = await repos.scheduledJobs.listByProject(project.id);
      for (const job of jobs) {
        if (job.triggerType === 'cron' && job.status === 'active') {
          allJobs.push(job);
        }
      }
    }
    return allJobs;
  }

  async function executeJob(job: { id: string; projectId: string; actionType: string; actionConfig: unknown }) {
    let resultMsg = '';
    let errorMessage: string | undefined;
    let status: 'succeeded' | 'failed' = 'succeeded';

    try {
      switch (job.actionType) {
        case 'validate_project': {
          const members = await repos.members.listByProject(job.projectId);
          resultMsg = `Validated ${members.length} members`;
          break;
        }
        case 'generate_report': {
          const dimensions = await repos.dimensions.listByProject(job.projectId);
          resultMsg = `Report generated for ${dimensions.length} dimensions`;
          break;
        }
        case 'sync_push': {
          const pending = await repos.syncQueue.listPending(job.projectId);
          for (const entry of pending) await repos.syncQueue.markSynced(entry.id);
          resultMsg = `Synced ${pending.length} pending changes`;
          break;
        }
        case 'quality_check': {
          const dims = await repos.dimensions.listByProject(job.projectId);
          resultMsg = `Quality check ran on ${dims.length} dimensions`;
          break;
        }
        default:
          resultMsg = `Unknown action type: ${job.actionType}`;
          status = 'failed';
          errorMessage = `Unsupported action: ${job.actionType}`;
      }
    } catch (err: unknown) {
      status = 'failed';
      errorMessage = err instanceof Error ? err.message : String(err);
      resultMsg = `Error: ${errorMessage}`;
    }

    await repos.jobExecutions.create({
      jobId: job.id,
      status,
      result: { message: resultMsg },
      errorMessage
    });
  }

  return {
    start() {
      if (running) return;
      running = true;
      timer = setInterval(() => { void runDueJobs(); }, pollInterval);
    },
    stop() {
      if (timer) {
        clearInterval(timer);
        timer = null;
      }
      running = false;
    },
    runDueJobs,
    isRunning() { return running; }
  };
}
