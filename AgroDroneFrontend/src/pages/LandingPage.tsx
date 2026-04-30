import logo from '../assets/agrodronelogo.png';
import { useMode } from '../contexts/ModeContext';
import { useDarkMode } from '../contexts/DarkModeContext';

export function LandingPage() {
  const { setMode } = useMode();
  const { darkMode, toggleDarkMode } = useDarkMode();

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-50 to-blue-50 dark:from-gray-900 dark:to-gray-800 flex flex-col items-center justify-center px-4">

      {/* Dark mode toggle */}
      <button
        onClick={toggleDarkMode}
        className="absolute top-4 right-4 p-2 rounded-full text-gray-500 dark:text-gray-400 hover:bg-gray-200 dark:hover:bg-gray-700 transition-colors"
        aria-label="Toggle dark mode"
      >
        {darkMode ? (
          <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 3v1m0 16v1m8.66-9h-1M4.34 12h-1m15.07-6.07-.71.71M5.64 18.36l-.71.71m12.02 0-.71-.71M5.64 5.64l-.71-.71M12 7a5 5 0 100 10A5 5 0 0012 7z" />
          </svg>
        ) : (
          <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M21 12.79A9 9 0 1111.21 3 7 7 0 0021 12.79z" />
          </svg>
        )}
      </button>

      <div className="w-full max-w-md text-center">

        {/* Logo + wordmark */}
        <div className="flex flex-col items-center mb-10">
          <img src={logo} alt="AgroDrone logo" className="h-24 w-24 mb-4 drop-shadow-md" />
          <h1 className="text-4xl font-bold text-gray-900 dark:text-white tracking-tight">AgroDrone</h1>
          <p className="text-gray-500 dark:text-gray-400 mt-2 text-lg">Semi-autonomous agricultural monitoring</p>
        </div>

        {/* Choice cards */}
        <div className="flex flex-col gap-4">
          <button
            onClick={() => setMode('account')}
            className="group w-full bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-2xl px-6 py-5 text-left shadow-sm hover:shadow-md hover:border-blue-300 dark:hover:border-blue-500 transition-all"
          >
            <div className="flex items-center gap-4">
              <div className="flex-shrink-0 w-11 h-11 bg-blue-100 dark:bg-blue-900 rounded-xl flex items-center justify-center group-hover:bg-blue-200 dark:group-hover:bg-blue-800 transition-colors">
                <svg className="w-5 h-5 text-blue-600 dark:text-blue-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
                </svg>
              </div>
              <div>
                <p className="text-base font-semibold text-gray-900 dark:text-white">Go to my account</p>
                <p className="text-sm text-gray-500 dark:text-gray-400 mt-0.5">Log in or create a new account</p>
              </div>
              <svg className="ml-auto w-5 h-5 text-gray-400 group-hover:text-blue-500 dark:group-hover:text-blue-400 transition-colors" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
              </svg>
            </div>
          </button>

          <button
            onClick={() => setMode('demo')}
            className="group w-full bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-2xl px-6 py-5 text-left shadow-sm hover:shadow-md hover:border-green-300 dark:hover:border-green-500 transition-all"
          >
            <div className="flex items-center gap-4">
              <div className="flex-shrink-0 w-11 h-11 bg-green-100 dark:bg-green-900 rounded-xl flex items-center justify-center group-hover:bg-green-200 dark:group-hover:bg-green-800 transition-colors">
                <svg className="w-5 h-5 text-green-600 dark:text-green-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M14.752 11.168l-3.197-2.132A1 1 0 0010 9.87v4.263a1 1 0 001.555.832l3.197-2.132a1 1 0 000-1.664z" />
                  <path strokeLinecap="round" strokeLinejoin="round" d="M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
              </div>
              <div>
                <p className="text-base font-semibold text-gray-900 dark:text-white">Try demo mode</p>
                <p className="text-sm text-gray-500 dark:text-gray-400 mt-0.5">Explore a live simulated flight — no account needed</p>
              </div>
              <svg className="ml-auto w-5 h-5 text-gray-400 group-hover:text-green-500 dark:group-hover:text-green-400 transition-colors" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
              </svg>
            </div>
          </button>
        </div>
      </div>
    </div>
  );
}
