import type {
  Answers,
  Field,
  FormSettings,
  FormStatus,
  ResponseMeta,
  ResponseSource,
} from "@/forms/types";

export interface NewFormInput {
  slug: string;
  title: string;
  description?: string;
  status?: FormStatus;
  fields: Field[];
  settings?: Partial<FormSettings>;
  workspace_id?: string | null;
}

export interface FormPatch {
  slug?: string;
  title?: string;
  description?: string;
  status?: FormStatus;
  fields?: Field[];
  settings?: FormSettings;
  workspace_id?: string | null;
}

export interface NewResponseInput {
  answers: Answers;
  source: ResponseSource;
  external_id?: string | null;
  submitted_at?: string;
  meta?: ResponseMeta;
}

export interface WebResponseInput {
  answers: Answers;
  meta: ResponseMeta;
  partial: boolean;
}
