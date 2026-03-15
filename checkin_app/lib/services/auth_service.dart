import 'dart:convert';
import 'package:http/http.dart' as http;
import 'package:shared_preferences/shared_preferences.dart';
import '../config.dart';

class AuthService {
  static const _tokenKey = 'authToken';

  Future<String?> getToken() async {
    final prefs = await SharedPreferences.getInstance();
    return prefs.getString(_tokenKey);
  }

  Future<bool> isLoggedIn() async {
    final token = await getToken();
    if (token == null) return false;

    // サーバー側で検証
    try {
      final response = await http.get(
        Uri.parse('$apiBaseUrl/api/auth/status'),
        headers: await authHeaders(),
      );
      if (response.statusCode == 200) {
        final data = jsonDecode(response.body);
        if (data['isAuthenticated'] == true) return true;
      }
    } catch (_) {}

    // 検証失敗時はトークンをクリア
    await _clearToken();
    return false;
  }

  Future<Map<String, String>> authHeaders() async {
    final token = await getToken();
    return {
      'Authorization': 'Bearer $token',
      'Content-Type': 'application/json',
    };
  }

  /// Google Client IDをサーバーから取得
  Future<String?> fetchGoogleClientId() async {
    try {
      final response = await http.get(
        Uri.parse('$apiBaseUrl/api/auth/config'),
      );
      if (response.statusCode == 200) {
        final data = jsonDecode(response.body);
        return data['googleClientId'] as String?;
      }
    } catch (_) {}
    return null;
  }

  /// Google IDトークンでログイン
  Future<({bool success, String? error})> loginWithGoogle(
    String credential,
  ) async {
    try {
      final response = await http.post(
        Uri.parse('$apiBaseUrl/api/auth/google'),
        headers: {'Content-Type': 'application/json'},
        body: jsonEncode({'credential': credential}),
      );

      final data = jsonDecode(response.body);

      if (response.statusCode == 200 && data['success'] == true) {
        final token = data['token'] as String?;
        if (token != null) {
          final prefs = await SharedPreferences.getInstance();
          await prefs.setString(_tokenKey, token);
          return (success: true, error: null);
        }
        return (success: false, error: 'トークンが取得できませんでした');
      }

      return (
        success: false,
        error: data['error'] as String? ?? 'Google認証に失敗しました',
      );
    } catch (e) {
      return (success: false, error: '通信エラーが発生しました');
    }
  }

  /// ゲストID/パスワードでログイン
  Future<({bool success, String? error})> login(
    String email,
    String password,
  ) async {
    try {
      final response = await http.post(
        Uri.parse('$apiBaseUrl/api/auth/login'),
        headers: {'Content-Type': 'application/json'},
        body: jsonEncode({'email': email, 'password': password}),
      );

      final data = jsonDecode(response.body);

      if (response.statusCode == 200 && data['success'] == true) {
        final token = data['token'] as String?;
        if (token != null) {
          final prefs = await SharedPreferences.getInstance();
          await prefs.setString(_tokenKey, token);
          return (success: true, error: null);
        }
        return (success: false, error: 'トークンが取得できませんでした');
      }

      return (
        success: false,
        error: data['error'] as String? ?? 'ログインに失敗しました',
      );
    } catch (e) {
      return (success: false, error: '通信エラーが発生しました');
    }
  }

  Future<void> logout() async {
    try {
      final headers = await authHeaders();
      await http.post(
        Uri.parse('$apiBaseUrl/api/auth/logout'),
        headers: headers,
      );
    } catch (_) {}
    await _clearToken();
  }

  Future<void> _clearToken() async {
    final prefs = await SharedPreferences.getInstance();
    await prefs.remove(_tokenKey);
  }
}
