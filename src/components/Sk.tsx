/** Short shimmer placeholder shown only until the first value arrives. */
export default function Sk({ w = "4.5em" }: { w?: string }) {
  return <span className="sk" style={{ width: w }} aria-label="loading" />;
}
