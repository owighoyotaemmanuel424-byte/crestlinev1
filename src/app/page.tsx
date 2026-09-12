'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';

export default function HomePage() {
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(false);
  }, []);

  if (loading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-blue-900 via-purple-900 to-indigo-900 flex items-center justify-center">
        <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-blue-400"></div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-900 via-purple-900 to-indigo-900">
      <nav className="fixed top-0 left-0 right-0 z-50 bg-black bg-opacity-20 backdrop-blur-md border-b border-white border-opacity-10">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between items-center h-16">
            <Link href="/" className="flex items-center space-x-2">
              <div className="w-10 h-10 bg-blue-500 rounded-lg flex items-center justify-center">
                <span className="text-white font-bold text-xl">CC</span>
              </div>
              <span className="text-white font-bold text-xl hidden sm:block">Crestline Capital</span>
            </Link>
            <div className="flex items-center space-x-6">
              <Link href="/about" className="text-white hover:text-blue-300 transition-colors">About</Link>
              <Link href="/services" className="text-white hover:text-blue-300 transition-colors">Services</Link>
              <Link href="/contact" className="text-white hover:text-blue-300 transition-colors">Contact</Link>
              <Link href="/login" className="bg-blue-500 hover:bg-blue-600 text-white px-4 py-2 rounded-lg transition-colors">
                Sign In
              </Link>
            </div>
          </div>
        </div>
      </nav>

      <section className="pt-32 pb-20 px-4 sm:px-6 lg:px-8">
        <div className="max-w-7xl mx-auto">
          <div className="grid lg:grid-cols-2 gap-12 items-center">
            <div>
              <h1 className="text-5xl lg:text-6xl font-bold text-white mb-6">
                Modern Banking
                <span className="text-blue-400"> Reimagined</span>
              </h1>
              <p className="text-xl text-gray-300 mb-8">
                Experience seamless digital banking with Crestline Capital. 
                Secure, fast, and designed for you.
              </p>
              <div className="flex flex-col sm:flex-row gap-4">
                <Link
                  href="/register"
                  className="bg-blue-500 hover:bg-blue-600 text-white px-8 py-4 rounded-lg font-semibold transition-colors text-center"
                >
                  Get Started
                </Link>
                <Link
                  href="/services"
                  className="border-2 border-white text-white hover:bg-white hover:text-blue-900 px-8 py-4 rounded-lg font-semibold transition-colors text-center"
                >
                  Learn More
                </Link>
              </div>
            </div>
            <div className="relative">
              <div className="bg-gradient-to-br from-blue-500 to-purple-600 rounded-3xl p-8 shadow-2xl">
                <div className="grid grid-cols-2 gap-4">
                  <div className="bg-white bg-opacity-10 rounded-xl p-6 backdrop-blur-sm">
                    <div className="w-12 h-12 bg-blue-400 rounded-xl flex items-center justify-center mb-4">
                      <span className="text-2xl">💳</span>
                    </div>
                    <h3 className="text-2xl font-bold text-white">10K+</h3>
                    <p className="text-gray-300">Active Users</p>
                  </div>
                  <div className="bg-white bg-opacity-10 rounded-xl p-6 backdrop-blur-sm">
                    <div className="w-12 h-12 bg-purple-400 rounded-xl flex items-center justify-center mb-4">
                      <span className="text-2xl">💰</span>
                    </div>
                    <h3 className="text-2xl font-bold text-white">$100M+</h3>
                    <p className="text-gray-300">Transactions</p>
                  </div>
                  <div className="bg-white bg-opacity-10 rounded-xl p-6 backdrop-blur-sm">
                    <div className="w-12 h-12 bg-green-400 rounded-xl flex items-center justify-center mb-4">
                      <span className="text-2xl">⚡</span>
                    </div>
                    <h3 className="text-2xl font-bold text-white">24/7</h3>
                    <p className="text-gray-300">Support</p>
                  </div>
                  <div className="bg-white bg-opacity-10 rounded-xl p-6 backdrop-blur-sm">
                    <div className="w-12 h-12 bg-orange-400 rounded-xl flex items-center justify-center mb-4">
                      <span className="text-2xl">🔒</span>
                    </div>
                    <h3 className="text-2xl font-bold text-white">Bank-Grade</h3>
                    <p className="text-gray-300">Security</p>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      <section className="py-20 px-4 sm:px-6 lg:px-8 bg-black bg-opacity-20">
        <div className="max-w-7xl mx-auto">
          <div className="text-center mb-16">
            <h2 className="text-4xl font-bold text-white mb-4">Why Choose Crestline Capital?</h2>
            <p className="text-xl text-gray-300">Everything you need for modern banking</p>
          </div>
          <div className="grid md:grid-cols-3 gap-8">
            <div className="bg-white bg-opacity-5 rounded-xl p-8 backdrop-blur-sm border border-white border-opacity-10">
              <div className="w-16 h-16 bg-blue-500 rounded-xl flex items-center justify-center mb-6">
                <span className="text-3xl">📱</span>
              </div>
              <h3 className="text-xl font-bold text-white mb-4">Mobile First</h3>
              <p className="text-gray-300">Access your accounts anywhere, anytime with our responsive design.</p>
            </div>
            <div className="bg-white bg-opacity-5 rounded-xl p-8 backdrop-blur-sm border border-white border-opacity-10">
              <div className="w-16 h-16 bg-purple-500 rounded-xl flex items-center justify-center mb-6">
                <span className="text-3xl">💸</span>
              </div>
              <h3 className="text-xl font-bold text-white mb-4">Zero Fees</h3>
              <p className="text-gray-300">No hidden charges. Transparent pricing on all transactions.</p>
            </div>
            <div className="bg-white bg-opacity-5 rounded-xl p-8 backdrop-blur-sm border border-white border-opacity-10">
              <div className="w-16 h-16 bg-green-500 rounded-xl flex items-center justify-center mb-6">
                <span className="text-3xl">🌍</span>
              </div>
              <h3 className="text-xl font-bold text-white mb-4">Global Reach</h3>
              <p className="text-gray-300">Send and receive money across borders with ease.</p>
            </div>
          </div>
        </div>
      </section>

      <section className="py-20 px-4 sm:px-6 lg:px-8">
        <div className="max-w-4xl mx-auto">
          <div className="bg-gradient-to-r from-blue-500 to-purple-600 rounded-3xl p-12 text-center shadow-2xl">
            <h2 className="text-4xl font-bold text-white mb-4">Ready to Get Started?</h2>
            <p className="text-xl text-blue-100 mb-8">
              Join thousands of satisfied customers today
            </p>
            <Link
              href="/register"
              className="inline-block bg-white text-blue-600 hover:bg-blue-50 px-8 py-4 rounded-lg font-semibold transition-colors"
            >
              Open an Account
            </Link>
          </div>
        </div>
      </section>

      <footer className="bg-black bg-opacity-40 py-12 px-4 sm:px-6 lg:px-8 border-t border-white border-opacity-10">
        <div className="max-w-7xl mx-auto">
          <div className="grid md:grid-cols-4 gap-8 mb-8">
            <div>
              <div className="flex items-center space-x-2 mb-4">
                <div className="w-10 h-10 bg-blue-500 rounded-lg flex items-center justify-center">
                  <span className="text-white font-bold text-xl">CC</span>
                </div>
                <span className="text-white font-bold text-xl">Crestline Capital</span>
              </div>
              <p className="text-gray-400">Modern banking for the digital age.</p>
            </div>
            <div>
              <h4 className="text-white font-semibold mb-4">Products</h4>
              <ul className="space-y-2">
                <li><Link href="/services" className="text-gray-400 hover:text-white transition-colors">All Services</Link></li>
                <li><Link href="/#" className="text-gray-400 hover:text-white transition-colors">Checking</Link></li>
                <li><Link href="/#" className="text-gray-400 hover:text-white transition-colors">Savings</Link></li>
                <li><Link href="/#" className="text-gray-400 hover:text-white transition-colors">Loans</Link></li>
              </ul>
            </div>
            <div>
              <h4 className="text-white font-semibold mb-4">Resources</h4>
              <ul className="space-y-2">
                <li><Link href="/about" className="text-gray-400 hover:text-white transition-colors">About Us</Link></li>
                <li><Link href="/contact" className="text-gray-400 hover:text-white transition-colors">Contact</Link></li>
                <li><Link href="/help" className="text-gray-400 hover:text-white transition-colors">Help Center</Link></li>
                <li><Link href="/faq" className="text-gray-400 hover:text-white transition-colors">FAQ</Link></li>
              </ul>
            </div>
            <div>
              <h4 className="text-white font-semibold mb-4">Legal</h4>
              <ul className="space-y-2">
                <li><Link href="/privacy" className="text-gray-400 hover:text-white transition-colors">Privacy Policy</Link></li>
                <li><Link href="/terms" className="text-gray-400 hover:text-white transition-colors">Terms of Service</Link></li>
                <li><Link href="/security" className="text-gray-400 hover:text-white transition-colors">Security</Link></li>
              </ul>
            </div>
          </div>
          <div className="border-t border-white border-opacity-10 pt-8">
            <p className="text-gray-400 text-center">
              &copy; {new Date().getFullYear()} Crestline Capital. All rights reserved.
            </p>
            <p className="text-gray-500 text-sm text-center mt-2">
              Crestline Capital operates in sandbox/demo mode. This is not a real banking service.
            </p>
          </div>
        </div>
      </footer>
    </div>
  );
}
