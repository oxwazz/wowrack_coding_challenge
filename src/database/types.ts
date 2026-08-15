import type { ColumnType, Generated } from "kysely";
import type {
  JobRunStatus,
  JobDefinition,
  JobStatus,
  JsonValue,
} from "../types.js";

type JsonColumn<T = JsonValue | null> = ColumnType<
  T,
  string | null,
  string | null
>;

export interface JobsTable {
  id: string;
  name: string;
  definition: JsonColumn<string[]>;
  createdAt: string;
  updatedAt: string;
}

export interface JobRunsTable {
  id: string;
  jobDefinitionId: string | null;
  jobsSnapshot: JsonColumn<JobDefinition[]>;
  status: JobRunStatus;
  createdAt: string;
}

export interface JobRunLogsTable {
  id: Generated<number>;
  jobRunId: string;
  jobId: string;
  status: JobStatus;
  attempt: number;
  result: JsonColumn;
  error: string | null;
  createdAt: string;
}

export interface Database {
  jobs: JobsTable;
  jobRuns: JobRunsTable;
  jobRunLogs: JobRunLogsTable;
}
