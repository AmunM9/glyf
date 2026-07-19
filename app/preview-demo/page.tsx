import { redirect } from 'next/navigation';
import PreviewDemo from './PreviewDemo';

export default function PreviewDemoPage() {
  if (process.env.NODE_ENV === 'production') redirect('/studio');
  return <PreviewDemo />;
}
