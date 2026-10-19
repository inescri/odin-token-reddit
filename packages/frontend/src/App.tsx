import { RouterProvider, createBrowserRouter } from 'react-router-dom';

import { BoardPage } from './routes/BoardPage';
import { HomePage } from './routes/HomePage';
import { Layout } from './routes/Layout';
import { ThreadPage } from './routes/ThreadPage';
import { SessionProvider } from './session/SessionProvider';

const router = createBrowserRouter([
  {
    path: '/',
    element: <Layout />,
    children: [
      { index: true, element: <HomePage /> },
      { path: 'b/:tokenId', element: <BoardPage /> },
      { path: 'b/:tokenId/t/:threadId', element: <ThreadPage /> },
    ],
  },
]);

export function App(): React.JSX.Element {
  return (
    <SessionProvider>
      <RouterProvider router={router} />
    </SessionProvider>
  );
}
