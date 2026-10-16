// Merge tags for emails: {{first_name}}, {{last_name}}, {{email}}, {{phone}}, {{property:Question}}.

import type { Contact } from "@/contacts/types";

export function renderTemplate(tpl: string, c: Contact): string {
  return tpl.replace(/\{\{\s*([a-z_]+)(?::([^}]+))?\s*\}\}/gi, (_, key: string, prop?: string) => {
    switch (key.toLowerCase()) {
      case "first_name":
        return c.first_name || "there";
      case "last_name":
        return c.last_name;
      case "email":
        return c.email;
      case "phone":
        return c.phone;
      case "property":
        return prop ? (c.properties[prop.trim()] ?? "") : "";
      default:
        return "";
    }
  });
}
