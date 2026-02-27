#include <iostream>
#include <string>

int main() {
    std::string input;

    // Read entire input from STDIN
    std::getline(std::cin, input);

    // Example processing
    std::cout << "Processed by C++: " << input << std::endl;

    return 0;
}