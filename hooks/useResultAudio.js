import { useEffect, useState } from 'react';
import { useLocation } from 'react-router-dom';
import { audioManager } from '../services/audioManager.js';

/** Records visibility owns the music; result/reward one-shots retain their own owners. */
export default function useResultAudio(identity, visible, confirmed) {
  const { pathname } = useLocation();
  const readiness = `${identity}:${Boolean(confirmed)}`;
  const [settledReadiness, setSettledReadiness] = useState(null);
  // Let the existing scene hook choose its entrance before accepting its initial
  // records render, including a later server confirmation. This is a React
  // commit boundary, not a second scene timer; cached music cannot start early.
  useEffect(() => { setSettledReadiness(readiness); }, [readiness]);
  useEffect(() => {
    audioManager.setResult(identity, pathname, confirmed && visible && settledReadiness === readiness);
    return () => audioManager.clearResult(identity);
  }, [identity, pathname, visible, confirmed, readiness, settledReadiness]);
}
