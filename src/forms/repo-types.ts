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
}

export interface FormPatch {
  slug?: string;
  title?: string;
  description?: string;
  status?: FormStatus;
  fields?: Field[];
  settings?: FormSettings;
}

export interface NewResponseInput {
  answers: Answers;
  source: ResponseSource;
  external_id?: string | null;
  submitted_at?: string;
  meta?: ResponseMeta;
}
