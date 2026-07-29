'use client';

type DropzoneProps = {
  onFile: (file: File) => void;
  error: string;
};

// Presentational only. The file object is handed to the caller, which reads
// it with FileReader/arrayBuffer and parses it in the same browser tab. This
// component never sends the file anywhere.
export function Dropzone({ onFile, error }: DropzoneProps) {
  return (
    <div className="dropzone">
      <label htmlFor="agreement-file">Upload your ASSIST articulation agreement PDF</label>
      <input
        id="agreement-file"
        type="file"
        accept="application/pdf"
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) onFile(file);
        }}
      />
      <p className="privacy-note">
        Your agreement is read in this browser tab. It is never uploaded and never stored.
      </p>
      {error && (
        <p role="alert" className="error">
          {error}
        </p>
      )}
    </div>
  );
}
