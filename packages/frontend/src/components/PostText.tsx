/** Plain text with preserved line breaks; React escapes everything (FR-011). */
export function PostText({ text, style }: { text: string; style?: React.CSSProperties }) {
  return <div style={{ whiteSpace: 'pre-wrap', overflowWrap: 'anywhere', ...style }}>{text}</div>;
}
