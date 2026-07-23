import { getSignedMediaUrl } from "./s3";
import { buildLocalVoiceUrl } from "./voiceLocalStore";
import { ResourceStatus } from "../models/Resource";



//resolveMediaUrl----------------------------------------------
//this function get the resource document  and return the url that we need to send to the frontend
// if the message is text => in that case the resource will be null
export async function resolveMediaUrl(resource: any | null | undefined): Promise<string | null> {
  if (!resource) return null;// if the resource dont exist then return it 
  try {// is the status of  resource is pending
    return resource.status === ResourceStatus.PENDING
      ? buildLocalVoiceUrl(resource.s3key)// then build the local url and set to the frontend
      : await getSignedMediaUrl(resource.s3key);// else get the signed url and send to the frontend
  } catch (err) {
    console.error("Failed to resolve media URL:", err);
    return null;
  }
}

//conclusion : this file know the buisnesslogic or rule that know the upload happens 
