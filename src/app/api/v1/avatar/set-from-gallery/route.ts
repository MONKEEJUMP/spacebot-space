import { retiredAvatarMutationResponse } from "../legacy-mutation-retired";

export const dynamic = "force-dynamic";

async function retiredHandler() {
  return retiredAvatarMutationResponse();
}

export {
  retiredHandler as DELETE,
  retiredHandler as GET,
  retiredHandler as HEAD,
  retiredHandler as OPTIONS,
  retiredHandler as PATCH,
  retiredHandler as POST,
  retiredHandler as PUT,
};
