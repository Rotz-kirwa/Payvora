import { Outlet, Link, createRootRoute, HeadContent, Scripts } from "@tanstack/react-router";
import { AuthProvider, getCurrentUserFn } from "@/lib/auth";

import appCss from "../styles.css?url";

function NotFoundComponent() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="max-w-md text-center">
        <h1 className="text-7xl font-bold text-foreground">404</h1>
        <h2 className="mt-4 text-xl font-semibold text-foreground">Page not found</h2>
        <p className="mt-2 text-sm text-muted-foreground">
          The page you're looking for doesn't exist or has been moved.
        </p>
        <div className="mt-6">
          <Link
            to="/"
            className="inline-flex items-center justify-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
          >
            Go home
          </Link>
        </div>
      </div>
    </div>
  );
}

export const Route = createRootRoute({
  loader: () => getCurrentUserFn(),
  head: () => ({
    meta: [
      { charSet: "utf-8" },
      { name: "viewport", content: "width=device-width, initial-scale=1" },
      { title: "Payment Pulse Dashboard" },
      { name: "description", content: "M-Pesa payment analytics and management dashboard" },
      { name: "author", content: "Paykit" },
      { property: "og:title", content: "Payment Pulse Dashboard" },
      { property: "og:description", content: "M-Pesa payment analytics and management dashboard" },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
    links: [
      {
        rel: "stylesheet",
        href: appCss,
      },
      {
        rel: "icon",
        type: "image/jpeg",
        href: "/favicon.jpg",
      },
    ],
  }),
  shellComponent: RootShell,
  component: RootComponent,
  notFoundComponent: NotFoundComponent,
});

function RootShell({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className="dark" suppressHydrationWarning>
      <head suppressHydrationWarning>
        <script
          dangerouslySetInnerHTML={{
            __html:
              "if(!globalThis.crypto)globalThis.crypto={};" +
              "if(!globalThis.crypto.randomUUID)globalThis.crypto.randomUUID=function(){" +
              "if(!globalThis.crypto.getRandomValues){return'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g,function(c){" +
              "var r=Math.random()*16|0,v=c==='x'?r:(r&3|8);return v.toString(16)});}" +
              "return([1e7]+-1e3+-4e3+-8e3+-1e11).replace(/[018]/g,function(c){" +
              "return(c^(globalThis.crypto.getRandomValues(new Uint8Array(1))[0]&(15>>c/4))).toString(16)});};",
          }}
        />
        <HeadContent />
      </head>
      <body suppressHydrationWarning>
        {children}
        <Scripts />
      </body>
    </html>
  );
}

function RootComponent() {
  const currentUser = Route.useLoaderData();

  return (
    <AuthProvider initialUser={currentUser}>
      <Outlet />
    </AuthProvider>
  );
}
