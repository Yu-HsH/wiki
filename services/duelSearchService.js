import {supabase,isSupabaseConfigured} from '../supabaseClient.js';
export async function requestDuelSearch(action,payload){
  if(!isSupabaseConfigured||!supabase)return {ok:false,code:'SEARCH_UNAVAILABLE'};
  try{const {data,error}=await supabase.functions.invoke('duel-search',{body:{action,...payload}});return error?{ok:false,code:'SEARCH_UNAVAILABLE'}:data||{ok:false,code:'SEARCH_UNAVAILABLE'};}
  catch{return {ok:false,code:'SEARCH_UNAVAILABLE'};}
}
