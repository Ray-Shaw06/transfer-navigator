'use client';

type DropzoneProps = {
  onFile: (file: File) => void;
  error: string;
};

// Presentational only. The file object is handed to the caller, which reads it
// with arrayBuffer and parses it in the same browser tab. This component never
// sends the file anywhere.
export function Dropzone({ onFile, error }: DropzoneProps) {
  return (
    <div className="dropzone">
      <label className="field-label" htmlFor="agreement-file">
        Agreement PDF from assist.org
      </label>
      <input
        id="agreement-file"
        type="file"
        accept="application/pdf"
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) onFile(file);
        }}
      />
      {error && (
        <p role="alert" className="notice" data-tone="error">
          {error}
        </p>
      )}
    </div>
  );
}
