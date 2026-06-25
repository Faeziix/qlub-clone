import createIntlMiddleware from "next-intl/middleware";
import { routing } from "./i18n/routing";

const intlMiddleware = createIntlMiddleware(routing);

export default intlMiddleware;

export const config = {
  matcher: [
    "/((?!api|_next/static|_next/image|favicon\\.svg|.*\\..*).*)",
  ],
};
