import { ImportWizard } from "@/components/import-wizard";

export const instant = false;

export default function ImportPage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Import Data</h1>
        <p className="text-muted-foreground">
          Upload WSUS CSV exports or a ZIP archive containing all datasets to
          update PostgreSQL.
        </p>
      </div>
      <ImportWizard />
    </div>
  );
}
