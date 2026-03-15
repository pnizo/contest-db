import 'dart:js_interop';
import 'package:flutter/material.dart';
import '../services/auth_service.dart';
import 'home_screen.dart';

@JS('google.accounts.id.initialize')
external void _gisInitialize(JSObject config);

@JS('google.accounts.id.prompt')
external void _gisPrompt();

class LoginScreen extends StatefulWidget {
  const LoginScreen({super.key});

  @override
  State<LoginScreen> createState() => _LoginScreenState();
}

class _LoginScreenState extends State<LoginScreen> {
  final _authService = AuthService();
  final _emailController = TextEditingController();
  final _passwordController = TextEditingController();
  bool _isLoading = false;
  bool _isGoogleLoading = false;
  String? _error;
  String? _googleClientId;
  bool _gisInitialized = false;

  @override
  void initState() {
    super.initState();
    _initGoogleSSO();
  }

  Future<void> _initGoogleSSO() async {
    final clientId = await _authService.fetchGoogleClientId();
    if (clientId != null && mounted) {
      setState(() => _googleClientId = clientId);
    }
  }

  void _ensureGisInitialized() {
    if (_gisInitialized || _googleClientId == null) return;
    try {
      final config = <String, Object>{
        'client_id': _googleClientId!,
        'callback': _handleGoogleCallback.toJS,
      }.jsify();
      _gisInitialize(config as JSObject);
      _gisInitialized = true;
    } catch (e) {
      debugPrint('GIS init error: $e');
    }
  }

  void _loginWithGoogle() {
    setState(() {
      _isGoogleLoading = true;
      _error = null;
    });

    try {
      _ensureGisInitialized();
      _gisPrompt();
      // prompt()はポップアップを表示するが、ユーザーがキャンセルした場合の
      // コールバックがないので、タイムアウトでローディング状態を解除
      Future.delayed(const Duration(seconds: 5), () {
        if (mounted && _isGoogleLoading) {
          setState(() => _isGoogleLoading = false);
        }
      });
    } catch (e) {
      setState(() {
        _isGoogleLoading = false;
        _error = 'Google認証の初期化に失敗しました';
      });
    }
  }

  void _handleGoogleCallback(JSObject response) async {
    final credential = (response as JSAny).dartify();
    if (credential is! Map) return;

    final idToken = credential['credential'] as String?;
    if (idToken == null) {
      if (mounted) {
        setState(() {
          _isGoogleLoading = false;
          _error = 'Google認証トークンが取得できませんでした';
        });
      }
      return;
    }

    final result = await _authService.loginWithGoogle(idToken);

    if (!mounted) return;

    if (result.success) {
      _navigateToHome();
    } else {
      setState(() {
        _isGoogleLoading = false;
        _error = result.error;
      });
    }
  }

  @override
  void dispose() {
    _emailController.dispose();
    _passwordController.dispose();
    super.dispose();
  }

  Future<void> _loginWithPassword() async {
    final email = _emailController.text.trim();
    final password = _passwordController.text;

    if (email.isEmpty || password.isEmpty) {
      setState(() => _error = 'IDとパスワードを入力してください');
      return;
    }

    setState(() {
      _isLoading = true;
      _error = null;
    });

    final result = await _authService.login(email, password);

    if (!mounted) return;

    if (result.success) {
      _navigateToHome();
    } else {
      setState(() {
        _isLoading = false;
        _error = result.error;
      });
    }
  }

  void _navigateToHome() {
    Navigator.of(context).pushReplacement(
      MaterialPageRoute(builder: (_) => const HomeScreen()),
    );
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      body: Center(
        child: SingleChildScrollView(
          padding: const EdgeInsets.all(32),
          child: ConstrainedBox(
            constraints: const BoxConstraints(maxWidth: 400),
            child: Column(
              mainAxisAlignment: MainAxisAlignment.center,
              children: [
                Icon(
                  Icons.qr_code_scanner,
                  size: 80,
                  color: Theme.of(context).colorScheme.primary,
                ),
                const SizedBox(height: 16),
                Text(
                  'FWJ チェックイン',
                  style: Theme.of(context).textTheme.headlineMedium?.copyWith(
                    fontWeight: FontWeight.bold,
                  ),
                ),
                const SizedBox(height: 48),

                // Google SSO
                if (_googleClientId != null) ...[
                  SizedBox(
                    width: double.infinity,
                    height: 48,
                    child: OutlinedButton.icon(
                      onPressed: _isGoogleLoading ? null : _loginWithGoogle,
                      icon: _isGoogleLoading
                          ? const SizedBox(
                              width: 20,
                              height: 20,
                              child: CircularProgressIndicator(strokeWidth: 2),
                            )
                          : const Icon(Icons.g_mobiledata, size: 28),
                      label: const Text('Googleでログイン'),
                      style: OutlinedButton.styleFrom(
                        side: const BorderSide(color: Colors.grey),
                      ),
                    ),
                  ),
                  const SizedBox(height: 24),
                  Row(
                    children: [
                      const Expanded(child: Divider()),
                      Padding(
                        padding: const EdgeInsets.symmetric(horizontal: 16),
                        child: Text(
                          'ゲストアカウント',
                          style: TextStyle(color: Colors.grey[600], fontSize: 13),
                        ),
                      ),
                      const Expanded(child: Divider()),
                    ],
                  ),
                  const SizedBox(height: 24),
                ],

                // ゲストID/パスワードログイン
                TextField(
                  controller: _emailController,
                  decoration: const InputDecoration(
                    labelText: 'ID',
                    prefixIcon: Icon(Icons.person_outlined),
                    border: OutlineInputBorder(),
                  ),
                  textInputAction: TextInputAction.next,
                ),
                const SizedBox(height: 16),
                TextField(
                  controller: _passwordController,
                  decoration: const InputDecoration(
                    labelText: 'パスワード',
                    prefixIcon: Icon(Icons.lock_outlined),
                    border: OutlineInputBorder(),
                  ),
                  obscureText: true,
                  textInputAction: TextInputAction.done,
                  onSubmitted: (_) => _loginWithPassword(),
                ),
                if (_error != null) ...[
                  const SizedBox(height: 16),
                  Text(
                    _error!,
                    style: TextStyle(
                      color: Theme.of(context).colorScheme.error,
                    ),
                  ),
                ],
                const SizedBox(height: 24),
                SizedBox(
                  width: double.infinity,
                  height: 48,
                  child: FilledButton(
                    onPressed: _isLoading ? null : _loginWithPassword,
                    child: _isLoading
                        ? const SizedBox(
                            width: 20,
                            height: 20,
                            child: CircularProgressIndicator(
                              strokeWidth: 2,
                              color: Colors.white,
                            ),
                          )
                        : const Text(
                            'ゲストログイン',
                            style: TextStyle(fontSize: 16),
                          ),
                  ),
                ),
              ],
            ),
          ),
        ),
      ),
    );
  }
}
