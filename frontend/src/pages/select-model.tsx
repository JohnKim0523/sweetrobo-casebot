// Phone model selection page
import React, { useState } from 'react';
import { useRouter } from 'next/router';
import Head from 'next/head';
import { PHONE_MODELS, PhoneModel, getModelsByBrand, getBrands } from '../types/phone-models';

export default function SelectModel() {
  const router = useRouter();
  const [selectedBrand, setSelectedBrand] = useState<string>('Apple');
  const brands = getBrands();
  const currentModels = getModelsByBrand(selectedBrand);

  const handleModelSelect = (model: PhoneModel) => {
    if (!model.available) return;
    
    // Store selected model in sessionStorage
    sessionStorage.setItem('selectedPhoneModel', model.id);
    
    // Navigate to upload page with model parameter
    router.push(`/editor?model=${model.id}`);
  };

  return (
    <>
      <Head>
        <title>Select Your Phone - SweetRobo</title>
        <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no" />
        <meta name="mobile-web-app-capable" content="yes" />
        <meta name="apple-mobile-web-app-capable" content="yes" />
        <meta name="apple-mobile-web-app-status-bar-style" content="black-translucent" />
      </Head>

      <div className="min-h-screen bg-gradient-to-b from-purple-500 to-pink-500 safe-top safe-bottom">
        {/* Mobile-only header */}
        <div className="sticky top-0 bg-black/20 backdrop-blur-md z-10 px-4 py-3 safe-top">
          <h1 className="text-2xl font-bold text-white text-center">
            Select Your Phone
          </h1>
          <p className="text-sm text-white/80 text-center mt-1">
            Choose your model to start designing
          </p>
        </div>

        {/* Brand Tabs */}
        <div className="px-4 pt-4">
          <div className="flex space-x-2 bg-white/10 p-1 rounded-xl backdrop-blur-sm">
            {brands.map((brand) => (
              <button
                key={brand}
                onClick={() => setSelectedBrand(brand)}
                className={`
                  flex-1 py-3 px-4 rounded-lg font-medium transition-all
                  ${selectedBrand === brand 
                    ? 'bg-white text-purple-600 shadow-lg' 
                    : 'text-white/80 active:scale-95'
                  }
                `}
              >
                {brand}
              </button>
            ))}
          </div>
        </div>

        {/* Phone Model List */}
        <div className="px-4 py-4 space-y-3">
          {currentModels.length === 0 ? (
            <div className="text-center py-8">
              <p className="text-white/80">No models available for {selectedBrand}</p>
            </div>
          ) : (
            currentModels.map((model) => (
              <button
                key={model.id}
                onClick={() => handleModelSelect(model)}
                disabled={!model.available}
                className={`
                  w-full bg-white rounded-2xl p-4 
                  flex items-center space-x-4
                  transition-all duration-200 transform
                  ${model.available 
                    ? 'active:scale-95 shadow-lg' 
                    : 'opacity-50'
                  }
                `}
              >
                {/* Phone Icon */}
                <div className="w-16 h-20 bg-gradient-to-b from-gray-200 to-gray-300 rounded-lg flex items-center justify-center flex-shrink-0">
                  {selectedBrand === 'Apple' ? (
                    // Apple logo simplified
                    <svg className="w-10 h-12 text-gray-600" viewBox="0 0 24 24" fill="currentColor">
                      <path d="M18.71 19.5c-.83 1.24-1.71 2.45-3.05 2.47-1.34.03-1.77-.79-3.29-.79-1.53 0-2 .77-3.27.82-1.31.05-2.3-1.32-3.14-2.53C4.25 17 2.94 12.45 4.7 9.39c.87-1.52 2.43-2.48 4.12-2.51 1.28-.02 2.5.87 3.29.87.78 0 2.26-1.07 3.81-.91.65.03 2.47.26 3.64 1.98-.09.06-2.17 1.28-2.15 3.81.03 3.02 2.65 4.03 2.68 4.04-.03.07-.42 1.44-1.38 2.83M13 3.5c.73-.83 1.94-1.46 2.94-1.5.13 1.17-.34 2.35-1.04 3.19-.69.85-1.83 1.51-2.95 1.42-.15-1.15.41-2.35 1.05-3.11z"/>
                    </svg>
                  ) : (
                    // Generic phone icon for Samsung
                    <svg 
                      className="w-10 h-14 text-gray-600"
                      fill="none" 
                      stroke="currentColor" 
                      viewBox="0 0 24 24"
                    >
                      <path 
                        strokeLinecap="round" 
                        strokeLinejoin="round" 
                        strokeWidth={1.5}
                        d="M12 18h.01M8 21h8a2 2 0 002-2V5a2 2 0 00-2-2H8a2 2 0 00-2 2v14a2 2 0 002 2z"
                      />
                    </svg>
                  )}
                </div>

                {/* Model Info */}
                <div className="flex-1 text-left">
                  <div className="text-lg font-semibold text-gray-900">
                    {model.model}
                  </div>
                  <div className="text-xs text-gray-500 mt-1">
                    {model.dimensions.widthMM} × {model.dimensions.heightMM}mm
                  </div>
                </div>

                {/* Status Badge */}
                <div className="flex-shrink-0">
                  {model.available ? (
                    <div className="bg-green-100 text-green-700 px-3 py-1 rounded-full text-xs font-medium">
                      Available
                    </div>
                  ) : (
                    <div className="bg-yellow-100 text-yellow-700 px-3 py-1 rounded-full text-xs font-medium">
                      Soon
                    </div>
                  )}
                </div>

                {/* Chevron for available models */}
                {model.available && (
                  <svg 
                    className="w-5 h-5 text-gray-400 flex-shrink-0"
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path 
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M9 5l7 7-7 7"
                    />
                  </svg>
                )}
              </button>
            ))
          )}
        </div>

        {/* Model Count Info */}
        <div className="px-4 pb-4">
          <div className="bg-white/10 backdrop-blur-sm rounded-xl p-4">
            <div className="flex justify-between items-center text-white/80 text-sm">
              <span>{currentModels.filter(m => m.available).length} models available</span>
              <span>{currentModels.filter(m => !m.available).length} coming soon</span>
            </div>
          </div>
        </div>

        {/* Bottom spacing for home indicator on iOS */}
        <div className="h-8 safe-bottom" />
      </div>

      <style jsx global>{`
        body {
          margin: 0;
          padding: 0;
          font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
          overflow-x: hidden;
          -webkit-touch-callout: none;
          -webkit-user-select: none;
          user-select: none;
        }

        /* Safe area padding for notched phones */
        .safe-top {
          padding-top: env(safe-area-inset-top);
        }
        
        .safe-bottom {
          padding-bottom: env(safe-area-inset-bottom);
        }

        /* Prevent pull-to-refresh on mobile */
        body {
          overscroll-behavior-y: none;
        }

        /* Remove tap highlight on mobile */
        * {
          -webkit-tap-highlight-color: transparent;
        }

        /* Ensure full height on mobile browsers */
        #__next {
          min-height: 100vh;
          min-height: -webkit-fill-available;
        }

        html {
          height: -webkit-fill-available;
        }
      `}</style>
    </>
  );
}