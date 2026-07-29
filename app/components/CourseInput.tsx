'use client';

type CourseInputProps = {
  value: string;
  onChange: (value: string) => void;
};

export function CourseInput({ value, onChange }: CourseInputProps) {
  return (
    <div className="course-input">
      <label htmlFor="completed">Courses you have finished, comma separated</label>
      <input
        id="completed"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder="CS 002, MATH 005A"
      />
    </div>
  );
}
