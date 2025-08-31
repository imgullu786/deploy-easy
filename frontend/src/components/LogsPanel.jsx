import React, { useEffect, useRef } from 'react';
import { Terminal } from 'lucide-react';

const LogsPanel = ({ logs, isLoading }) => {
  const logsEndRef = useRef(null);

  useEffect(() => {
    logsEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [logs]);

  return (
    <div className="bg-white/90 backdrop-blur-xl p-6 rounded-xl shadow-lg border border-gray-200">
      {/* Header */}
      <div className="flex items-center space-x-2 mb-4">
        <Terminal className="h-5 w-5 text-indigo-600" />
        <h3 className="text-lg font-semibold text-gray-900">Deployment Logs</h3>
        {isLoading && (
          <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-indigo-600 ml-2"></div>
        )}
      </div>

      {/* Terminal body */}
      <div className="bg-gray-950 rounded-lg p-4 h-96 overflow-y-auto font-mono text-sm shadow-inner border border-gray-800">
        {logs.length > 0 ? (
          logs.map((log, index) => (
            <div key={index} className="mb-1">
              <span className="text-gray-500 text-xs mr-2">
                {new Date(log.timestamp).toLocaleTimeString()}
              </span>
              <span
                className={
                  log.level === 'error'
                    ? 'text-red-400 font-semibold'
                    : log.level === 'warn'
                    ? 'text-yellow-400'
                    : log.level === 'success'
                    ? 'text-green-400'
                    : 'text-gray-300'
                }
              >
                {log.message}
              </span>
            </div>
          ))
        ) : (
          <div className="text-gray-500 text-center py-8 italic">
            No logs available. Deploy your project to see logs here.
          </div>
        )}
        <div ref={logsEndRef} />
      </div>
    </div>
  );
};

export default LogsPanel;
