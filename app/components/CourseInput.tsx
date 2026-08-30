'use client';

type CourseInputProps = {
  value: string;
  onChange: (value: string) => void;
};

export function CourseInput({ value, onChange }: CourseInputProps) {
  return (
    <div className="field">
      <label htmlFor="completed">Courses you have already finished</label>
      <input
        id="completed"
        type="text"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder="CS 002, MATH 005A, ENGL 001A"
      />
      <p className="field-note">
        Comma separated, exactly as your college writes them. Matched in this browser and never
        sent anywhere.
      </p>
    </div>
  );
}
